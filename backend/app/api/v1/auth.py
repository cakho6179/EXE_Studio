from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import re
import secrets
from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    decode_access_token, decode_refresh_token,
)
from app.core.config import settings
from app.core.ratelimit import (
    login_limiter, LOGIN_LIMIT, LOGIN_WINDOW,
    otp_verify_limiter, OTP_VERIFY_LIMIT, OTP_VERIFY_WINDOW,
    otp_send_limiter, OTP_SEND_LIMIT, OTP_SEND_WINDOW,
)
from app.core.emailer import send_otp_email
from app.models.entities import User, UserProfile, OtpCode
from app.schemas.all_schemas import UserRegister, UserLogin, TokenResponse, UserOut, UserProfileUpdate
from pydantic import BaseModel, EmailStr, Field
from fastapi.security import OAuth2PasswordBearer

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)

EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")


def _normalize_email(email: str) -> str:
    """Chuẩn hóa email: trim + lowercase (tránh trùng tài khoản do hoa/thường)."""
    return (email or "").strip().lower()


def _token_pair(user: User) -> dict:
    """Cấp cặp access (ngắn hạn) + refresh (dài hạn) và trả payload user chuẩn."""
    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "university": user.university,
            "major": user.major,
        },
    }


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
        # Token hợp lệ nhưng user không tồn tại -> phiên không còn giá trị -> 401 (không phải 404)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản không còn tồn tại. Vui lòng đăng nhập lại.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

@router.post("/register", response_model=TokenResponse)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    email = _normalize_email(user_in.email)
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Email chưa đúng định dạng.")
    if len(user_in.password) < 8:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 8 ký tự.")
    full_name = (user_in.full_name or "").strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=400, detail="Vui lòng nhập họ tên đầy đủ.")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email này đã được đăng ký tài khoản.")

    user = User(
        email=email,
        password_hash=hash_password(user_in.password),
        full_name=full_name,
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

    return _token_pair(user)

@router.post("/login", response_model=TokenResponse)
def login(login_in: UserLogin, db: Session = Depends(get_db)):
    email = _normalize_email(login_in.email)
    if not login_limiter.allow(f"login:{email}", LOGIN_LIMIT, LOGIN_WINDOW):
        raise HTTPException(status_code=429, detail="Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 5 phút.")

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(login_in.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Email hoặc mật khẩu không chính xác.")

    login_limiter.reset(f"login:{email}")
    return _token_pair(user)


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(payload: RefreshRequest, db: Session = Depends(get_db)):
    """Đổi refresh token lấy cặp token mới (access ngắn hạn + refresh mới)."""
    user_id = decode_refresh_token(payload.refresh_token or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh token không hợp lệ. Vui lòng đăng nhập lại.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Tài khoản không còn tồn tại.")
    return _token_pair(user)

class GoogleAuthRequest(BaseModel):
    # Frontend demo chỉ gửi email chọn tài khoản; id_token chỉ có khi tích hợp Google Identity thật
    id_token: str = ""
    email: Optional[str] = None


@router.post("/google", response_model=TokenResponse)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Google Sign-In: xác minh id_token qua tokeninfo của Google (kèm kiểm tra aud khi cấu hình
    GOOGLE_CLIENT_ID). Ở chế độ demo (id_token rỗng) -> đăng nhập tài khoản sinh viên mẫu.
    """
    import httpx

    id_token = (payload.id_token or "").strip()
    # Chế độ demo 1-chạm: nếu client gửi email -> đăng nhập đúng tài khoản đó nếu tồn tại (mô phỏng SSO .edu.vn)
    demo_email = _normalize_email(payload.email) if payload.email else "chau.nguyen@vnuhcm.edu.vn"

    if not id_token:
        # Chế độ demo 1-chạm: chỉ dùng cho trình diễn học thuật, không dùng production.
        user = db.query(User).filter(User.email == demo_email).first()
        if not user:
            user = User(
                email=demo_email,
                password_hash=hash_password("password123"),
                full_name="Nguyễn Minh Châu",
                student_id="21120001",
                university="ĐHQG TP.HCM",
                major="Công nghệ Thông tin",
                academic_year=3,
                is_email_verified=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            profile = UserProfile(user_id=user.id)
            db.add(profile)
            db.commit()
        return _token_pair(user)

    # Xác minh id_token thật với Google
    try:
        resp = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
            timeout=10.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="id_token Google không hợp lệ.")
        info = resp.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Không xác minh được id_token với Google.")

    if settings.GOOGLE_CLIENT_ID and info.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="id_token không phát hành cho ứng dụng này (aud).")
    if info.get("email_verified") not in ("true", True):
        raise HTTPException(status_code=401, detail="Email Google chưa được xác minh.")

    email = _normalize_email(info.get("email", ""))
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(24)),
            full_name=info.get("name") or email.split("@")[0],
            university="ĐHQG TP.HCM",
            major="Công nghệ Thông tin",
            academic_year=3,
            is_email_verified=True,
            avatar_url=info.get("picture"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.add(UserProfile(user_id=user.id))
        db.commit()

    return _token_pair(user)

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
    """Tạo mã OTP 6 số hiệu lực 10 phút, gửi qua SMTP (demo: trả dev_code + log console)."""
    email = _normalize_email(payload.email)
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Email chưa đúng định dạng.")
    if not otp_send_limiter.allow(f"otp-send:{email}", OTP_SEND_LIMIT, OTP_SEND_WINDOW):
        raise HTTPException(status_code=429, detail="Bạn đã yêu cầu mã quá nhiều lần. Vui lòng thử lại sau 10 phút.")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Không lộ email tồn tại hay không, nhưng vẫn 200
        return {"status": "success", "message": "Nếu email tồn tại, mã xác minh đã được gửi."}
    # Vô hiệu mã cũ chưa dùng
    db.query(OtpCode).filter(OtpCode.email == email, OtpCode.is_used == False).update({"is_used": True})
    code = f"{secrets.randbelow(900000) + 100000}"
    db.add(OtpCode(email=email, code=code, expires_at=datetime.utcnow() + timedelta(minutes=10)))
    db.commit()
    send_otp_email(email, code)

    response = {
        "status": "success",
        "message": f"Đã gửi mã xác minh 6 số đến {email} (hiệu lực 10 phút).",
    }
    if settings.OTP_RETURN_DEV_CODE:
        response["dev_code"] = code  # Chỉ bật ở chế độ demo học thuật
    return response


@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Vui lòng nhập mã xác minh.")
    if not otp_verify_limiter.allow(f"otp-verify:{email}", OTP_VERIFY_LIMIT, OTP_VERIFY_WINDOW):
        raise HTTPException(status_code=429, detail="Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.")

    record = db.query(OtpCode).filter(
        OtpCode.email == email, OtpCode.code == code, OtpCode.is_used == False
    ).order_by(OtpCode.created_at.desc()).first()
    if not record:
        raise HTTPException(status_code=400, detail="Mã xác minh không đúng.")
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Mã đã hết hạn. Vui lòng gửi lại mã mới.")
    # KHÔNG đánh dấu đã dùng ở đây: mã còn hiệu lực cho bước đặt mật khẩu mới
    # (luồng quên mật khẩu: verify -> reset-password dùng cùng mã).
    otp_verify_limiter.reset(f"otp-verify:{email}")
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.is_email_verified = True
        db.commit()
    return {"status": "success", "message": "Xác minh email thành công!"}


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Đặt mật khẩu mới bằng mã OTP còn hiệu lực (tiêu thụ mã sau khi dùng)."""
    email = _normalize_email(payload.email)
    code = (payload.code or "").strip()
    if len(payload.new_password or "") < 8:
        raise HTTPException(status_code=400, detail="Mật khẩu mới tối thiểu 8 ký tự.")
    record = db.query(OtpCode).filter(
        OtpCode.email == email, OtpCode.code == code, OtpCode.is_used == False
    ).order_by(OtpCode.created_at.desc()).first()
    if not record:
        raise HTTPException(status_code=400, detail="Mã xác minh không đúng.")
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Mã đã hết hạn. Vui lòng gửi lại mã mới.")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    user.password_hash = hash_password(payload.new_password)
    user.is_email_verified = True
    record.is_used = True
    db.commit()
    return {"status": "success", "message": "Đặt lại mật khẩu thành công! Hãy đăng nhập lại."}

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
