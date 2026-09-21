from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.core.database import get_db
from app.core.cache import cached_response
from app.core.timeutils import vn_now, vn_day_start_utc, vn_today_iso
from app.models.entities import User, Task, MicroSubtask, FocusSession, ScheduleEvent
from app.api.v1.auth import get_current_user

router = APIRouter()


@router.get("/list")
@cached_response(ttl=30)
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Thông báo học thuật dựng từ dữ liệu DB thật (deadline, tồn đọng, phiên hôm nay)."""
    # So deadline theo giờ VN (deadline lưu naive UTC sau khi client gửi kèm múi giờ)
    now = datetime.utcnow()
    items = []

    def _to_naive_utc(dt):
        if not dt:
            return None
        if getattr(dt, 'tzinfo', None) is not None:
            from datetime import timezone
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    # 1. Deadline sắp tới / quá hạn
    tasks = db.query(Task).filter(
        Task.user_id == current_user.id, Task.status != "completed",
    ).all()
    overdue = [t for t in tasks if t.deadline and _to_naive_utc(t.deadline) < now]
    due_soon = [t for t in tasks if t.deadline and now <= _to_naive_utc(t.deadline) <= now + timedelta(days=3)]
    for t in overdue[:2]:
        items.append({
            "icon": "⏰", "tone": "urgent",
            "title": f"Quá hạn: {t.title[:50]}",
            "detail": f"Hạn nộp đã qua ({t.deadline.strftime('%d/%m %H:%M')}). Ưu tiên xử lý ngay.",
            "time_label": "Quá hạn",
            "link": "/tasks",
        })
    for t in due_soon[:2]:
        dl = _to_naive_utc(t.deadline)
        days_left = max(0, (dl - now).days)
        left_txt = "hôm nay" if days_left == 0 else f"còn {days_left} ngày"
        remaining = db.query(MicroSubtask).filter(
            MicroSubtask.task_id == t.id, MicroSubtask.is_completed == False
        ).count()
        items.append({
            "icon": "📅", "tone": "info",
            "title": f"Sắp đến hạn: {t.title[:50]}",
            "detail": f"Hạn {t.deadline.strftime('%d/%m %H:%M')} ({left_txt}). Còn {remaining} micro-sprints chưa xong.",
            "time_label": left_txt,
            "link": "/tasks",
        })

    # 2. Phiên focus hôm nay (ranh giới theo giờ VN)
    today_start = vn_day_start_utc(0)
    today_count = db.query(FocusSession).filter(
        FocusSession.user_id == current_user.id, FocusSession.created_at >= today_start
    ).count()
    if today_count > 0:
        items.append({
            "icon": "🌊", "tone": "success",
            "title": f"Đã hoàn thành {today_count} phiên Deep Work hôm nay",
            "detail": "Nhịp tập trung ổn định. Giữ phong độ cho khung giờ vàng tiếp theo.",
            "time_label": "Hôm nay",
            "link": "/sound",
        })
    else:
        items.append({
            "icon": "🌱", "tone": "info",
            "title": "Chưa có phiên tập trung nào hôm nay",
            "detail": "Bắt đầu 1 phiên Pomodoro 25 phút vào khung giờ bạn tỉnh táo nhất.",
            "time_label": "Gợi ý",
            "link": "/deepwork?duration=25",
        })

    # 3. Sự kiện lịch hôm nay chưa xong (lọc đúng ngày VN, không đếm tồn đọng cũ)
    pending_events = db.query(ScheduleEvent).filter(
        ScheduleEvent.user_id == current_user.id,
        ScheduleEvent.is_completed == False,
        ScheduleEvent.event_date >= vn_today_iso(),
    ).count()
    if pending_events:
        items.append({
            "icon": "✨", "tone": "info",
            "title": f"Còn {pending_events} sự kiện trong lịch hôm nay",
            "detail": "Lịch đã được tối ưu theo nhịp sinh học của bạn.",
            "time_label": "Lịch trình",
            "link": "/schedule",
        })

    return {"notifications": items[:6], "unread_count": len(items[:6])}
