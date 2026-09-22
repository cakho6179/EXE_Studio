import json
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.cache import cached_response
from app.core.timeutils import vn_today_date
from app.models.entities import StudyPlan, User
from app.api.v1.auth import get_current_user
from app.services.circadian_service import CircadianService

router = APIRouter()


class StudyPlanCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    subject: Optional[str] = None
    exam_date: Optional[str] = None  # YYYY-MM-DD
    hours_per_day: float = Field(default=3.0, ge=0.5, le=16)


class StudyPlanGenerate(BaseModel):
    subject: str = Field(min_length=2, max_length=255)
    exam_date: Optional[str] = None
    hours_per_day: float = Field(default=3.0, ge=0.5, le=16)
    level: str = Field(default="medium")  # easy, medium, intense


class StudyPlanProgress(BaseModel):
    progress: float = Field(ge=0.0, le=100.0)


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.strptime(s.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="exam_date phải dạng YYYY-MM-DD.")


def _out(p: StudyPlan) -> dict:
    try:
        phases = json.loads(p.phases_json or "[]")
    except (json.JSONDecodeError, TypeError):
        phases = []
    return {
        "id": p.id,
        "title": p.title,
        "subject": p.subject,
        "exam_date": p.exam_date,
        "hours_per_day": p.hours_per_day,
        "level": p.level,
        "phases": phases,
        "summary": p.summary,
        "progress": p.progress or 0.0,
        "created_at": p.created_at,
    }


@router.get("/", response_model=list)
@cached_response(ttl=30)
def list_plans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plans = (
        db.query(StudyPlan)
        .filter(StudyPlan.user_id == current_user.id)
        .order_by(StudyPlan.created_at.desc())
        .all()
    )
    return [_out(p) for p in plans]


@router.post("/", status_code=201)
def create_plan(
    plan_in: StudyPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exam = _parse_date(plan_in.exam_date)
    plan = StudyPlan(
        user_id=current_user.id,
        title=plan_in.title.strip(),
        subject=(plan_in.subject or "").strip() or None,
        exam_date=exam.isoformat() if exam else None,
        hours_per_day=plan_in.hours_per_day,
        level="manual",
        phases_json="[]",
        summary=None,
        progress=0.0,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _out(plan)


@router.post("/generate", status_code=201)
def generate_plan(
    gen_in: StudyPlanGenerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    level = gen_in.level if gen_in.level in ("easy", "medium", "intense") else "medium"
    exam = _parse_date(gen_in.exam_date)
    # "Hôm nay" theo lịch VN (trước đây date.today() lệch múi giờ khi deploy UTC)
    today = vn_today_date()
    total_days = max(1, (exam - today).days) if exam else 21
    total_days = min(total_days, 120)

    daily_min = int(gen_in.hours_per_day * 60)
    # Chia 3 chặng: nền tảng (40%) → củng cố (35%) → tổng ôn + mock (25%)
    cuts = [int(total_days * 0.4), int(total_days * 0.75)]
    stage_names = {
        "easy": ["Làm quen khái niệm", "Luyện bài tập cơ bản", "Ôn nhẹ + nghỉ nhiều"],
        "medium": ["Xây nền tảng", "Củng cố + bài khó", "Tổng ôn + đề mock"],
        "intense": ["Nạp tốc toàn chương", "Cày đề cường độ cao", "Chốt lỗ hổng + mock"],
    }[level]
    stage_focus = {
        "easy": ["Đọc giáo trình, ghi chú", "Bài tập mẫu từng dạng", "Flashcard + ngủ đủ"],
        "medium": ["Lý thuyết + ví dụ", "Bài tập nâng cao", "Đề các năm + sửa lỗi"],
        "intense": ["Tóm tắt + công thức", "Đề giờ thật mỗi ngày", "Review lỗi sai + giữ sức"],
    }[level]

    phases = []
    for i in range(total_days):
        d = today + timedelta(days=i)
        stage = 0 if i < cuts[0] else (1 if i < cuts[1] else 2)
        # Nhẹ chủ nhật để não củng cố trí nhớ
        minutes = daily_min if d.weekday() != 6 else max(30, int(daily_min * 0.5))
        phases.append({
            "date": d.isoformat(),
            "stage": stage_names[stage],
            "focus": f"{gen_in.subject.strip()}: {stage_focus[stage]}",
            "minutes": minutes,
        })

    total_hours = round(sum(p["minutes"] for p in phases) / 60, 1)
    summary = (
        f"Lộ trình {level} cho {gen_in.subject.strip()}: {total_days} ngày, "
        f"~{total_hours} giờ (~{gen_in.hours_per_day}h/ngày)"
        + (f", thi ngày {exam.isoformat()}" if exam else ", chưa đặt ngày thi")
        + ". Chủ nhật học nhẹ để não củng cố trí nhớ."
    )
    plan = StudyPlan(
        user_id=current_user.id,
        title=f"Ôn {gen_in.subject.strip()}",
        subject=gen_in.subject.strip(),
        exam_date=exam.isoformat() if exam else None,
        hours_per_day=gen_in.hours_per_day,
        level=level,
        phases_json=json.dumps(phases, ensure_ascii=False),
        summary=summary,
        progress=0.0,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {"message": f"AI đã lên lộ trình {total_days} ngày cho {gen_in.subject.strip()}!", "plan": _out(plan)}


@router.patch("/{plan_id}")
def update_plan_progress(
    plan_id: str,
    payload: StudyPlanProgress,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cập nhật tiến độ (%) của kế hoạch ôn tập khi sinh viên tick hoàn thành buổi học."""
    plan = (
        db.query(StudyPlan)
        .filter(StudyPlan.id == plan_id, StudyPlan.user_id == current_user.id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Không tìm thấy kế hoạch.")
    plan.progress = round(payload.progress, 1)
    db.commit()
    db.refresh(plan)
    return {"status": "success", "id": plan.id, "progress": plan.progress}


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = (
        db.query(StudyPlan)
        .filter(StudyPlan.id == plan_id, StudyPlan.user_id == current_user.id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Không tìm thấy kế hoạch.")
    db.delete(plan)
    db.commit()
    return {"status": "success", "message": "Đã xóa kế hoạch."}


@router.post("/{plan_id}/apply-to-schedule")
def apply_plan_to_schedule(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Áp dụng các chặng học của Study Plan vào Lịch trình thời khóa biểu."""
    from app.models.entities import ScheduleEvent
    plan = (
        db.query(StudyPlan)
        .filter(StudyPlan.id == plan_id, StudyPlan.user_id == current_user.id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Không tìm thấy kế hoạch.")

    phases = []
    try:
        phases = json.loads(plan.phases_json or "[]")
    except Exception:
        pass

    if not phases:
        raise HTTPException(status_code=400, detail="Kế hoạch chưa có lộ trình chi tiết để áp dụng.")

    added_count = 0
    # Giới hạn tối đa 21 buổi để không làm nghẽn lịch trình
    for p in phases[:21]:
        p_date = p.get("date")
        if not p_date:
            continue
        # Tránh thêm trùng lặp cùng ngày cùng môn học
        existing = db.query(ScheduleEvent).filter(
            ScheduleEvent.user_id == current_user.id,
            ScheduleEvent.event_date == p_date,
            ScheduleEvent.title.like(f"%{plan.subject or plan.title}%")
        ).first()
        if existing:
            continue

        mins = min(max(30, int(p.get("minutes", 90))), 480)
        profile = current_user.profile
        chronotype = CircadianService._norm_chronotype((profile.chronotype if profile else "lark") or "lark")
        golden_ranges = CircadianService.GOLDEN_RANGES.get(chronotype, CircadianService.GOLDEN_RANGES["lark"])
        first_slot = golden_ranges[0].split(" - ")[0]
        start_h, start_m = map(int, first_slot.split(":"))
        end_min_total = min(start_h * 60 + start_m + mins, 23 * 60 + 45)
        end_h = (end_min_total // 60) % 24
        end_m = end_min_total % 60
        start_str = f"{start_h:02d}:{start_m:02d}"
        end_str = f"{end_h:02d}:{end_m:02d}"

        ev = ScheduleEvent(
            user_id=current_user.id,
            title=f"Ôn {plan.subject or plan.title}: {p.get('stage', 'Học sâu')}",
            description=p.get("focus", f"Kế hoạch {plan.title}"),
            event_date=p_date,
            start_time=start_str,
            end_time=end_str,
            event_type="deep_work",
            is_circadian_optimized=True,
        )
        db.add(ev)
        added_count += 1

    db.commit()
    return {
        "status": "success",
        "added_count": added_count,
        "message": f"Đã áp dụng thành công {added_count} buổi ôn tập vào Lịch trình theo nhịp sinh học!",
    }
