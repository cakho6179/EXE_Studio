from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.core.database import get_db
from app.models.entities import User, Task, MicroSubtask, FocusSession, ScheduleEvent
from app.api.v1.auth import get_current_user

router = APIRouter()


@router.get("/list")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Thông báo học thuật dựng từ dữ liệu DB thật (deadline, tồn đọng, phiên hôm nay)."""
    now = datetime.utcnow()
    items = []

    # 1. Deadline sắp tới / quá hạn
    tasks = db.query(Task).filter(
        Task.user_id == current_user.id, Task.status != "completed",
    ).all()
    overdue = [t for t in tasks if t.deadline and t.deadline < now]
    due_soon = [t for t in tasks if t.deadline and now <= t.deadline <= now + timedelta(days=3)]
    for t in overdue[:2]:
        items.append({
            "icon": "⏰", "tone": "urgent",
            "title": f"Quá hạn: {t.title[:50]}",
            "detail": f"Hạn nộp đã qua ({t.deadline.strftime('%d/%m %H:%M')}). Ưu tiên xử lý ngay.",
            "time_label": "Quá hạn",
        })
    for t in due_soon[:2]:
        days_left = max(0, (t.deadline - now).days)
        left_txt = "hôm nay" if days_left == 0 else f"còn {days_left} ngày"
        remaining = db.query(MicroSubtask).filter(
            MicroSubtask.task_id == t.id, MicroSubtask.is_completed == False
        ).count()
        items.append({
            "icon": "📅", "tone": "info",
            "title": f"Sắp đến hạn: {t.title[:50]}",
            "detail": f"Hạn {t.deadline.strftime('%d/%m %H:%M')} ({left_txt}). Còn {remaining} micro-sprints chưa xong.",
            "time_label": left_txt,
        })

    # 2. Phiên focus hôm nay
    today_start = datetime.combine(now.date(), datetime.min.time())
    today_count = db.query(FocusSession).filter(
        FocusSession.user_id == current_user.id, FocusSession.created_at >= today_start
    ).count()
    if today_count > 0:
        items.append({
            "icon": "🌊", "tone": "success",
            "title": f"Đã hoàn thành {today_count} phiên Deep Work hôm nay",
            "detail": "Nhịp tập trung ổn định. Giữ phong độ cho khung giờ vàng tiếp theo.",
            "time_label": "Hôm nay",
        })
    else:
        items.append({
            "icon": "🌱", "tone": "info",
            "title": "Chưa có phiên tập trung nào hôm nay",
            "detail": "Bắt đầu 1 phiên Pomodoro 25 phút vào khung giờ bạn tỉnh táo nhất.",
            "time_label": "Gợi ý",
        })

    # 3. Sự kiện lịch hôm nay chưa xong
    pending_events = db.query(ScheduleEvent).filter(
        ScheduleEvent.user_id == current_user.id, ScheduleEvent.is_completed == False
    ).count()
    if pending_events:
        items.append({
            "icon": "✨", "tone": "info",
            "title": f"Còn {pending_events} sự kiện trong lịch hôm nay",
            "detail": "Lịch đã được tối ưu theo nhịp sinh học của bạn.",
            "time_label": "Lịch trình",
        })

    return {"notifications": items[:6], "unread_count": len(items[:6])}
