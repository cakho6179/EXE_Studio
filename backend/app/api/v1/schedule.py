from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from typing import List
from app.core.database import get_db
from app.models.entities import User, ScheduleEvent, Task
from app.api.v1.auth import get_current_user
from app.core.timeutils import vn_today_iso
from app.core.constants import PRIORITY_RANK
from app.services.circadian_service import CircadianService
from app.schemas.all_schemas import ScheduleEventCreate, ScheduleEventOut, ScheduleEventUpdate

router = APIRouter()

# Hậu tố mô tả khung giờ cho từng tuýp sinh học (đi kèm slot sắp lịch)
_CHRONOTYPE_SLOT_LABELS = {
    "lark": ["Khung giờ vàng sáng (Alpha 10Hz)", "Khung giờ vàng chiều (Đỉnh tỉnh thức)", "Khung giờ vàng tối (Ôn tập & Ghi nhớ)"],
    "owl": ["Khung giờ chiều nâng năng lượng", "Khung giờ vàng tối (Đỉnh Cú Đêm)", "Khung giờ tối sâu (Ôn tập nhịp Owl)"],
    "hummingbird": ["Khung giờ vàng giữa sáng", "Khung giờ vàng chiều", "Khung giờ tối ôn tập"],
    "bear": ["Khung giờ vàng giữa sáng", "Khung giờ vàng chiều", "Khung giờ vàng tối (Ôn tập & Ghi nhớ)"],
}


def _get_owned_event(db: Session, event_id: str, user: User) -> ScheduleEvent:
    event = db.query(ScheduleEvent).filter(
        ScheduleEvent.id == event_id,
        ScheduleEvent.user_id == user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện.")
    return event


@router.get("/timeline", response_model=List[ScheduleEventOut])
def get_today_timeline(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Chỉ trả về sự kiện của chính user này (user mới -> danh sách trống).
    # Dữ liệu mẫu chỉ seed cho tài khoản demo trong main.py, không tự sinh ké.
    return db.query(ScheduleEvent).filter(
        ScheduleEvent.user_id == current_user.id
    ).order_by(ScheduleEvent.start_time.asc()).all()

@router.post("/events", response_model=ScheduleEventOut, status_code=201)
def create_event(
    event_in: ScheduleEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Kiểm tra hợp lệ giờ "HH:MM" để tránh dữ liệu hỏng hiển thị sai grid tuần
    for t in (event_in.start_time, event_in.end_time):
        parts = (t or "").split(":")
        if len(parts) != 2 or not all(p.isdigit() and len(p) == 2 for p in parts):
            raise HTTPException(status_code=400, detail="Giờ phải có định dạng HH:MM (ví dụ 14:00).")

    event = ScheduleEvent(
        user_id=current_user.id,
        task_id=event_in.task_id,
        title=event_in.title,
        description=event_in.description,
        # Mặc định sự kiện không rõ ngày -> gán hôm nay theo giờ Việt Nam
        event_date=event_in.event_date or vn_today_iso(),
        start_time=event_in.start_time,
        end_time=event_in.end_time,
        event_type=event_in.event_type,
        is_circadian_optimized=event_in.is_circadian_optimized
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/events/{event_id}", response_model=ScheduleEventOut)
def update_event(
    event_id: str,
    event_in: ScheduleEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sửa sự kiện: dời giờ, đổi tên, đánh dấu hoàn thành..."""
    event = _get_owned_event(db, event_id, current_user)
    for field, value in event_in.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/events/{event_id}/toggle", response_model=ScheduleEventOut)
def toggle_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = _get_owned_event(db, event_id, current_user)
    event.is_completed = not event.is_completed
    db.commit()
    db.refresh(event)
    return event

@router.delete("/events/{event_id}")
def delete_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = _get_owned_event(db, event_id, current_user)
    db.delete(event)
    db.commit()
    return {"status": "success", "message": "Đã xóa sự kiện thời khóa biểu."}

@router.post("/auto-balance")
def auto_balance_schedule(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    AI Chronobiology Scheduling Balance:
    Finds active high-priority tasks and maps them into the student's golden hours.
    Khung giờ lấy theo tuýp sinh học CỦA CHÍNH user (GOLDEN_RANGES), không còn cứng cho mọi người.
    """
    profile = current_user.profile
    chronotype = (profile.chronotype if profile else "lark") or "lark"

    tasks = db.query(Task).filter(
        Task.user_id == current_user.id,
        Task.status != "completed"
    ).order_by(Task.deadline.asc().nullslast()).limit(3).all()
    tasks.sort(key=lambda t: -PRIORITY_RANK.get(t.priority, 0))  # stable sort giữ thứ tự deadline

    # Khung giờ vàng thật theo chronotype từ CircadianService
    golden_ranges = CircadianService.GOLDEN_RANGES.get(chronotype, CircadianService.GOLDEN_RANGES["lark"])
    slot_labels = _CHRONOTYPE_SLOT_LABELS.get(chronotype, _CHRONOTYPE_SLOT_LABELS["lark"])
    golden_slots = []
    for i, rng in enumerate(golden_ranges[:3]):
        start = rng.split(" - ")[0]
        end_parts = rng.split(" - ")
        end = end_parts[1] if len(end_parts) > 1 else start
        h, m = map(int, start.split(":"))
        eh, em = map(int, end.split(":"))
        dur = max(60, (eh * 60 + em) - (h * 60 + m))  # phiên học sâu tối thiểu 60 phút
        end_h = h + dur // 60
        end_m = m + dur % 60
        if end_m >= 60:
            end_h += 1
            end_m -= 60
        golden_slots.append((f"{h:02d}:{m:02d}", f"{end_h:02d}:{end_m % 24:02d}", slot_labels[i % len(slot_labels)]))

    balanced_count = 0
    today_iso = vn_today_iso()
    for idx, task in enumerate(tasks):
        if idx < len(golden_slots):
            st, et, note = golden_slots[idx]
            # Mỗi task một ngày kế tiếp để không dồn lịch học sâu cùng lúc
            from datetime import timedelta
            day_iso = (date.fromisoformat(today_iso) + timedelta(days=idx)).isoformat()
            # Check if event already exists for this task
            existing = db.query(ScheduleEvent).filter(
                ScheduleEvent.user_id == current_user.id,
                ScheduleEvent.task_id == task.id
            ).first()
            if not existing:
                new_ev = ScheduleEvent(
                    user_id=current_user.id,
                    task_id=task.id,
                    title=f"Học sâu: {task.title}",
                    description=f"{note} • Tập trung hoàn thành sprint môn {task.subject_name}",
                    event_date=day_iso,
                    start_time=st,
                    end_time=et,
                    event_type="deep_work",
                    is_completed=False,
                    is_circadian_optimized=True
                )
                db.add(new_ev)
                balanced_count += 1

    db.commit()
    events = db.query(ScheduleEvent).filter(
        ScheduleEvent.user_id == current_user.id
    ).order_by(ScheduleEvent.start_time.asc()).all()

    return {
        "status": "success",
        "message": f"Thuật toán AI đã tự động tối ưu và sắp xếp {balanced_count} phiên học sâu vào khung giờ vàng ({chronotype}).",
        "events_count": len(events)
    }
