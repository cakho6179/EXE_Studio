from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.models.entities import User, UserProfile, OtpCode
from app.schemas.all_schemas import UserRegister, UserLogin, TokenResponse, UserOut, UserProfileUpdate
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordBearer

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu token xác thực. Vui lòng đăng nhập lại.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token xác thực không hợp lệ.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    return user

@router.post("/register", response_model=TokenResponse)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email này đã được đăng ký tài khoản.")
    
    user = User(
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        full_name=user_in.full_name,
        university=user_in.university,
        major=user_in.major,
        academic_year=user_in.academic_year
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create default user profile
    profile = UserProfile(
        user_id=user.id,
        chronotype="lark",
        target_daily_focus_hours=6.0,
        target_gpa=3.6
    )
    db.add(profile)
    db.commit()

    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "university": user.university,
            "major": user.major
        }
    }

@router.post("/login", response_model=TokenResponse)
def login(login_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_in.email).first()
    if not user or not verify_password(login_in.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Email hoặc mật khẩu không chính xác.")
    
    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "university": user.university,
            "major": user.major
        }
    }

@router.post("/google", response_model=TokenResponse)
def google_auth(db: Session = Depends(get_db)):
    """Mock Google OAuth login - auto authenticates demo student Chau Nguyen."""
    user = db.query(User).filter(User.email == "chau.nguyen@vnuhcm.edu.vn").first()
    if not user:
        user = User(
            email="chau.nguyen@vnuhcm.edu.vn",
            password_hash=hash_password("password123"),
            full_name="Nguyễn Minh Châu",
            student_id="21120001",
            university="ĐHQG TP.HCM",
            major="Công nghệ Thông tin",
            academic_year=3
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        profile = UserProfile(user_id=user.id)
        db.add(profile)
        db.commit()

    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "university": user.university,
            "major": user.major
        }
    }

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


class ForgotRequest(BaseModel):
    email: str


class VerifyOtpRequest(BaseModel):
    email: str
    code: str


@router.post("/forgot")
def forgot_password(payload: ForgotRequest, db: Session = Depends(get_db)):
    """Tạo mã OTP 6 số hiệu lực 10 phút. Demo học thuật: trả dev_code để hoàn tất luồng."""
    email = (payload.email or "").strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Email chưa đúng định dạng.")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Không lộ email tồn tại hay không, nhưng vẫn 200
        return {"status": "success", "message": "Nếu email tồn tại, mã xác minh đã được gửi."}
    # Vô hiệu mã cũ chưa dùng
    db.query(OtpCode).filter(OtpCode.email == email, OtpCode.is_used == False).update({"is_used": True})
    code = f"{secrets.randbelow(900000) + 100000}"
    db.add(OtpCode(email=email, code=code, expires_at=datetime.utcnow() + timedelta(minutes=10)))
    db.commit()
    print(f"[Studio AI] OTP cho {email}: {code}")
    return {
        "status": "success",
        "message": f"Đã gửi mã xác minh 6 số đến {email} (hiệu lực 10 phút).",
        "dev_code": code,
    }


@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Vui lòng nhập mã xác minh.")
    record = db.query(OtpCode).filter(
        OtpCode.email == email, OtpCode.code == code, OtpCode.is_used == False
    ).order_by(OtpCode.created_at.desc()).first()
    if not record:
        raise HTTPException(status_code=400, detail="Mã xác minh không đúng.")
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Mã đã hết hạn. Vui lòng gửi lại mã mới.")
    record.is_used = True
    db.commit()
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.is_email_verified = True
        db.commit()
    return {"status": "success", "message": "Xác minh email thành công!"}

@router.get("/profile")
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = current_user.profile
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return {
        "user_id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "university": current_user.university,
        "major": current_user.major,
        "academic_year": current_user.academic_year,
        "chronotype": profile.chronotype,
        "wake_up_time": profile.wake_up_time,
        "bed_time": profile.bed_time,
        "peak_start_time": profile.peak_start_time,
        "peak_end_time": profile.peak_end_time,
        "target_daily_focus_hours": profile.target_daily_focus_hours,
        "target_gpa": profile.target_gpa,
        "preferred_study_style": profile.preferred_study_style
    }

@router.put("/profile")
def update_profile(
    profile_in: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Update user fields
    if profile_in.full_name is not None:
        current_user.full_name = profile_in.full_name
    if profile_in.university is not None:
        current_user.university = profile_in.university
    if profile_in.major is not None:
        current_user.major = profile_in.major
    if profile_in.academic_year is not None:
        current_user.academic_year = profile_in.academic_year

    # Update or create profile fields
    profile = current_user.profile
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    if profile_in.chronotype is not None:
        profile.chronotype = profile_in.chronotype
    if profile_in.wake_up_time is not None:
        profile.wake_up_time = profile_in.wake_up_time
    if profile_in.bed_time is not None:
        profile.bed_time = profile_in.bed_time
    if profile_in.peak_start_time is not None:
        profile.peak_start_time = profile_in.peak_start_time
    if profile_in.peak_end_time is not None:
        profile.peak_end_time = profile_in.peak_end_time
    if profile_in.target_daily_focus_hours is not None:
        profile.target_daily_focus_hours = profile_in.target_daily_focus_hours
    if profile_in.target_gpa is not None:
        profile.target_gpa = profile_in.target_gpa
    if profile_in.preferred_study_style is not None:
        profile.preferred_study_style = profile_in.preferred_study_style

    db.commit()
    db.refresh(current_user)
    db.refresh(profile)

    return {
        "status": "success",
        "message": "Cập nhật hồ sơ sinh viên thành công!",
        "profile": {
            "full_name": current_user.full_name,
            "university": current_user.university,
            "major": current_user.major,
            "academic_year": current_user.academic_year,
            "chronotype": profile.chronotype,
            "wake_up_time": profile.wake_up_time,
            "bed_time": profile.bed_time,
            "peak_start_time": profile.peak_start_time,
            "peak_end_time": profile.peak_end_time,
            "target_daily_focus_hours": profile.target_daily_focus_hours,
            "target_gpa": profile.target_gpa,
            "preferred_study_style": profile.preferred_study_style
        }
    }
