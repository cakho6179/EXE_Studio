from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import AiUsage, Subscription, User
from app.api.v1.auth import get_current_user

router = APIRouter()

# Catalog khớp bảng giá landing (VND). Giới hạn free để sau này enforce.
PLANS = {
    "free": {
        "name": "Bản Miễn Phí",
        "monthly": 0,
        "yearly": 0,
        "features": [
            "Nhịp sinh học cơ bản",
            "2 không gian âm thanh",
            "3 lần AI phân rã / tháng",
        ],
        "limits": {"ai_decompose_per_month": 3, "sounds": 2, "study_plans": 3},
    },
    "pro": {
        "name": "Stuđiô Pro Sinh Viên",
        "monthly": 39000,
        "yearly": 390000,
        "features": [
            "Phân tích nhịp sinh học nâng cao",
            "Kho âm thanh 432Hz & LoFi không giới hạn",
            "AI phân rã + kế hoạch không giới hạn",
            "Đồng bộ Canvas / Notion / Google Calendar",
        ],
        "limits": {"ai_decompose_per_month": -1, "sounds": -1, "study_plans": -1},
    },
}

CYCLES = {
    "monthly": {"months": 1, "label": "Theo tháng"},
    "yearly": {"months": 12, "label": "Theo năm (tiết kiệm 2 tháng)"},
}

PROVIDERS = {"demo", "momo", "card", "bank"}


class CheckoutRequest(BaseModel):
    plan: str = Field(default="pro")
    cycle: str = Field(default="monthly")
    provider: str = Field(default="demo")
    edu_email: Optional[str] = None


def _active_sub(db: Session, user_id: str) -> Optional[Subscription]:
    now = datetime.utcnow()
    return (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user_id,
            Subscription.status == "active",
            ((Subscription.expires_at.is_(None)) | (Subscription.expires_at > now)),
        )
        .order_by(Subscription.created_at.desc())
        .first()
    )


def plan_of(user_id: str, db: Session) -> dict:
    sub = _active_sub(db, user_id)
    if not sub:
        return {"plan": "free", "expires_at": None, "subscription_id": None}
    return {"plan": sub.plan, "expires_at": sub.expires_at, "subscription_id": sub.id}


def current_month() -> str:
    return datetime.utcnow().strftime("%Y-%m")


def ai_quota(db: Session, user_id: str) -> dict:
    """Quota AI phân rã tháng hiện tại. Pro (-1) = không giới hạn."""
    info = plan_of(user_id, db)
    limit = PLANS.get(info["plan"], PLANS["free"])["limits"]["ai_decompose_per_month"]
    if limit is not None and limit < 0:
        return {"plan": info["plan"], "used": 0, "limit": -1, "remaining": -1}
    row = (
        db.query(AiUsage)
        .filter(AiUsage.user_id == user_id, AiUsage.month == current_month())
        .first()
    )
    used = row.decompose_count if row else 0
    return {"plan": info["plan"], "used": used, "limit": limit,
            "remaining": max(0, limit - used)}


def consume_ai_quota(db: Session, user_id: str) -> None:
    """Trừ 1 lượt AI. Hết quota gói Free -> 403 kèm hướng nâng cấp."""
    q = ai_quota(db, user_id)
    if q["limit"] is not None and q["limit"] >= 0 and q["remaining"] <= 0:
        raise HTTPException(
            status_code=403,
            detail=f"Gói Miễn Phí hết {q['limit']} lượt AI phân rã tháng này. Nâng cấp Pro để không giới hạn!",
        )
    row = (
        db.query(AiUsage)
        .filter(AiUsage.user_id == user_id, AiUsage.month == current_month())
        .first()
    )
    if not row:
        row = AiUsage(user_id=user_id, month=current_month(), decompose_count=0)
        db.add(row)
    row.decompose_count = (row.decompose_count or 0) + 1
    db.commit()


@router.get("/plans")
def list_plans():
    return {"plans": PLANS, "cycles": CYCLES}


@router.get("/status")
def billing_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    info = plan_of(current_user.id, db)
    plan = PLANS.get(info["plan"], PLANS["free"])
    return {**info, "plan_name": plan["name"], "limits": plan["limits"]}


@router.get("/quota")
def billing_quota(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lượt AI còn lại trong tháng (để UI hiển thị + gợi nâng cấp)."""
    return ai_quota(db, current_user.id)


@router.post("/checkout", status_code=201)
def checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = (payload.plan or "pro").lower()
    cycle = (payload.cycle or "monthly").lower()
    provider = (payload.provider or "demo").lower()
    if plan not in PLANS or plan == "free":
        raise HTTPException(status_code=400, detail="Gói không hợp lệ (chọn pro).")
    if cycle not in CYCLES:
        raise HTTPException(status_code=400, detail="Chu kỳ không hợp lệ.")
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Phương thức thanh toán chưa hỗ trợ.")

    # Hủy gói active cũ trước khi tạo gói mới (1 user — 1 gói hiệu lực)
    old = _active_sub(db, current_user.id)
    if old:
        old.status = "cancelled"
        old.cancelled_at = datetime.utcnow()

    now = datetime.utcnow()
    months = CYCLES[cycle]["months"]
    # Ước lượng 30 ngày/tháng cho demo (không dùng relativedelta để khỏi thêm dependency)
    expires = now + timedelta(days=30 * months)
    sub = Subscription(
        user_id=current_user.id,
        plan=plan,
        cycle=cycle,
        amount=PLANS[plan][cycle],
        currency="VND",
        status="active",
        provider=provider,
        provider_ref=f"demo-{provider}-{int(now.timestamp())}" if provider == "demo" else None,
        started_at=now,
        expires_at=expires,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return {
        "status": "success",
        "message": f"Đã kích hoạt {PLANS[plan]['name']} ({CYCLES[cycle]['label']}) đến {expires.strftime('%d/%m/%Y')}!",
        "subscription": {
            "id": sub.id,
            "plan": sub.plan,
            "cycle": sub.cycle,
            "amount": sub.amount,
            "status": sub.status,
            "expires_at": sub.expires_at,
        },
    }


@router.post("/cancel")
def cancel_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = _active_sub(db, current_user.id)
    if not sub:
        raise HTTPException(status_code=404, detail="Bạn đang dùng gói Miễn Phí.")
    sub.status = "cancelled"
    sub.cancelled_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Đã hủy gói Pro. Quyền lợi giữ đến hết chu kỳ đã trả."}
