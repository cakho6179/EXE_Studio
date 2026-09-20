from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.entities import User, ScheduleEvent
from app.api.v1.auth import get_current_user
from app.schemas.all_schemas import ScheduleEventCreate, ScheduleEventOut

router = APIRouter()

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

@router.post("/events", response_model=ScheduleEventOut)
def create_event(
    event_in: ScheduleEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = ScheduleEvent(
        user_id=current_user.id,
        task_id=event_in.task_id,
        title=event_in.title,
        description=event_in.description,
        event_date=event_in.event_date,
        start_time=event_in.start_time,
        end_time=event_in.end_time,
        event_type=event_in.event_type,
        is_circadian_optimized=event_in.is_circadian_optimized
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event

@router.patch("/events/{event_id}/toggle", response_model=ScheduleEventOut)
def toggle_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(ScheduleEvent).filter(
        ScheduleEvent.id == event_id,
        ScheduleEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện thời khóa biểu.")
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
    event = db.query(ScheduleEvent).filter(
        ScheduleEvent.id == event_id,
        ScheduleEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện.")
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
    """
    from app.models.entities import Task
    from datetime import date, timedelta
    tasks = db.query(Task).filter(
        Task.user_id == current_user.id,
        Task.status != "completed"
    ).order_by(Task.priority.desc()).limit(3).all()

    golden_slots = [
        ("08:30", "10:00", "Khung giờ vàng sáng (Alpha 10Hz)"),
        ("14:00", "15:30", "Khung giờ vàng chiều (Đỉnh tỉnh thức)"),
        ("19:30", "21:00", "Khung giờ vàng tối (Ôn tập & Ghi nhớ)")
    ]

    balanced_count = 0
    today = date.today()
    for idx, task in enumerate(tasks):
        if idx < len(golden_slots):
            st, et, note = golden_slots[idx]
            day_iso = (today + timedelta(days=idx)).isoformat()
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
        "message": f"Thuật toán AI đã tự động tối ưu và sắp xếp {balanced_count} phiên học sâu vào khung giờ vàng.",
        "events_count": len(events)
    }
