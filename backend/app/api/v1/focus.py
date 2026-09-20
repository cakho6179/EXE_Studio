from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.timeutils import utc_day_range_vn
from app.models.entities import User, FocusSession, Task, MicroSubtask
from app.api.v1.auth import get_current_user
from app.schemas.all_schemas import FocusSessionCreate, FocusSessionOut

router = APIRouter()

@router.post("/session/complete", response_model=FocusSessionOut, status_code=201)
def record_focus_session(
    session_in: FocusSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = FocusSession(
        user_id=current_user.id,
        task_id=session_in.task_id,
        planned_minutes=session_in.planned_minutes,
        actual_minutes=session_in.actual_minutes,
        distractions_count=session_in.distractions_count,
        ambient_sound_used=session_in.ambient_sound_used or "Sóng Biển 432Hz",
        notes=session_in.notes
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Nếu gắn task: chỉ tự tick subtask kế tiếp khi client yêu cầu (mặc định giữ hành vi cũ)
    if session_in.task_id:
        task = db.query(Task).filter(Task.id == session_in.task_id, Task.user_id == current_user.id).first()
        if task:
            if session_in.complete_next_subtask:
                subtask = db.query(MicroSubtask).filter(
                    MicroSubtask.task_id == task.id,
                    MicroSubtask.is_completed == False
                ).order_by(MicroSubtask.order_index.asc()).first()
                if subtask:
                    subtask.is_completed = True
                    db.commit()

            completed_count = db.query(MicroSubtask).filter(
                MicroSubtask.task_id == task.id,
                MicroSubtask.is_completed == True
            ).count()
            task.completed_sprints = completed_count
            if completed_count >= task.total_sprints and task.total_sprints > 0:
                task.status = "completed"
            db.commit()

    return session

@router.get("/sessions", response_model=list[FocusSessionOut])
def list_focus_sessions(
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ranh giới ngày tính theo giờ Việt Nam (fix lệch UTC)
    since, _ = utc_day_range_vn(days - 1)
    return db.query(FocusSession).filter(
        FocusSession.user_id == current_user.id,
        FocusSession.created_at >= since,
    ).order_by(FocusSession.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/today-summary")
def get_today_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # "Hôm nay" theo lịch Việt Nam (fix lệch UTC cho phiên học nửa đêm)
    today_start, today_end = utc_day_range_vn(0)
    sessions = db.query(FocusSession).filter(
        FocusSession.user_id == current_user.id,
        FocusSession.created_at >= today_start,
        FocusSession.created_at < today_end
    ).all()

    total_minutes = sum(s.actual_minutes for s in sessions)
    total_hours = round(total_minutes / 60.0, 1)
    session_count = len(sessions)
    distractions = sum(s.distractions_count for s in sessions)
    planned_total = sum(s.planned_minutes for s in sessions)

    # Hiệu suất = thực hiện / kế hoạch (thật, thay số 88% cứng ở dashboard)
    efficiency = int(total_minutes / planned_total * 100) if planned_total > 0 else 0

    # Giờ hôm qua để so sánh
    y_start, y_end = utc_day_range_vn(1)
    y_sessions = db.query(FocusSession).filter(
        FocusSession.user_id == current_user.id,
        FocusSession.created_at >= y_start,
        FocusSession.created_at < y_end,
    ).all()
    yesterday_hours = round(sum(s.actual_minutes for s in y_sessions) / 60.0, 1)

    target_hours = current_user.profile.target_daily_focus_hours if current_user.profile else 6.0
    progress_percent = min(100, int((total_hours / target_hours) * 100)) if target_hours > 0 else 0

    return {
        "today_focus_hours": total_hours,
        "target_hours": target_hours,
        "progress_percent": progress_percent,
        "completed_sessions": session_count,
        "total_distractions": distractions,
        "planned_minutes": planned_total,
        "efficiency_percent": efficiency,
        "yesterday_hours": yesterday_hours,
        "calm_quality": "Chất lượng cao" if distractions <= 2 else "Khá tốt"
    }
