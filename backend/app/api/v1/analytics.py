from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from app.core.database import get_db
from app.models.entities import User, Task, FocusSession
from app.api.v1.auth import get_current_user

router = APIRouter()

# Phạm vi gộp nhóm: range -> (số bucket, số ngày mỗi bucket)
RANGE_BUCKETS = {
    "week": (7, 1),
    "month": (7, 4),      # 28 ngày gần nhất, mỗi điểm = 4 ngày
    "semester": (7, 17),   # ~120 ngày gần nhất, mỗi điểm = 17 ngày
}


@router.get("/dashboard")
def get_analytics_dashboard(
    range_param: str = Query(default="week", alias="range"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    selected = range_param if range_param in RANGE_BUCKETS else "week"
    n_buckets, bucket_days = RANGE_BUCKETS[selected]
    today = date.today()
    week_days_labels = []
    weekly_focus_hours = []

    # 1. Giờ focus thật, gộp theo bucket của phạm vi được chọn
    total_real_week_minutes = 0
    for b in range(n_buckets - 1, -1, -1):
        end_day = today - timedelta(days=b * bucket_days)
        start_day = end_day - timedelta(days=bucket_days - 1)
        day_start = datetime.combine(start_day, datetime.min.time())
        day_end = datetime.combine(end_day, datetime.max.time())

        sessions = db.query(FocusSession).filter(
            FocusSession.user_id == current_user.id,
            FocusSession.created_at >= day_start,
            FocusSession.created_at <= day_end
        ).all()

        total_mins = sum(s.actual_minutes for s in sessions)
        total_real_week_minutes += total_mins
        hours = round(total_mins / 60.0, 1)

        if selected == "week":
            weekday_vn = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"][end_day.weekday()]
            week_days_labels.append(weekday_vn)
        elif selected == "month":
            week_days_labels.append(f"{start_day.strftime('%d/%m')}-{end_day.strftime('%d/%m')}")
        else:
            week_days_labels.append(f"Tuần {start_day.strftime('%d/%m')}")
        weekly_focus_hours.append(hours)

    total_week_hours = round(total_real_week_minutes / 60.0, 1)

    # Số liệu thật từ DB (không dùng đường cong giả khi user mới)

    # 2. Real Task completion rate
    total_tasks = db.query(Task).filter(Task.user_id == current_user.id).count()
    completed_tasks = db.query(Task).filter(Task.user_id == current_user.id, Task.status == "completed").count()
    completion_rate = int((completed_tasks / total_tasks) * 100) if total_tasks > 0 else 0

    # 3. Consecutive Day Streak (thật, không mặc định 12)
    streak = 0
    for i in range(30):
        check_day = today - timedelta(days=i)
        count = db.query(FocusSession).filter(
            FocusSession.user_id == current_user.id,
            FocusSession.created_at >= datetime.combine(check_day, datetime.min.time()),
            FocusSession.created_at <= datetime.combine(check_day, datetime.max.time())
        ).count()
        if count > 0:
            streak += 1
        elif i > 0:
            break

    # 4. Circadian alignment score (thật: 0 khi chưa có phiên)
    all_sessions = db.query(FocusSession).filter(FocusSession.user_id == current_user.id).all()
    if all_sessions:
        aligned_count = 0
        for s in all_sessions:
            h = s.created_at.hour
            if (8 <= h < 12) or (14 <= h < 17) or (19 <= h < 22):
                aligned_count += 1
        circadian_score = int((aligned_count / len(all_sessions)) * 100)
    else:
        circadian_score = 0

    # 5. Subject radar + chi tiết từng môn (số liệu thật cho thẻ Skills)
    from app.models.entities import MicroSubtask
    tasks_by_subject = {}
    subject_details = []
    all_tasks = db.query(Task).filter(Task.user_id == current_user.id).all()
    for t in all_tasks:
        name = f"{t.subject_name} ({t.subject_code})" if t.subject_code else (t.subject_name or "Chung")
        tasks_by_subject[name] = tasks_by_subject.get(name, 0) + (t.completed_sprints * 20)

    subject_radar = []
    if tasks_by_subject:
        for subj, val in tasks_by_subject.items():
            score = min(98, max(0, 75 + val)) if val else 0
            subject_radar.append({"subject": subj, "score": score})
    # Gom sprints theo môn để render thẻ kỹ năng
    subj_groups = {}
    for t in all_tasks:
        key = (t.subject_name or "Chung", t.subject_code or "")
        g = subj_groups.setdefault(key, {"completed": 0, "total": 0, "tasks": 0})
        g["completed"] += t.completed_sprints or 0
        g["total"] += t.total_sprints or 0
        g["tasks"] += 1
    for (sname, scode), g in subj_groups.items():
        pct = int(g["completed"] / g["total"] * 100) if g["total"] else 0
        level = "Mới bắt đầu" if pct < 25 else ("Đang tiến bộ" if pct < 60 else ("Khá giỏi" if pct < 90 else "Chuyên gia"))
        subject_details.append({
            "subject_name": sname,
            "subject_code": scode,
            "completed_sprints": g["completed"],
            "total_sprints": g["total"],
            "task_count": g["tasks"],
            "progress_percent": pct,
            "level": level,
            "xp": g["completed"] * 20,
        })

    # 6. Huy hiệu theo luật thật (streak / phiên / sprints / hoàn thành / sinh học)
    total_sessions = len(all_sessions)
    total_focus_min = sum(s.actual_minutes for s in all_sessions)
    completed_subtasks = db.query(MicroSubtask).join(Task, MicroSubtask.task_id == Task.id).filter(
        Task.user_id == current_user.id, MicroSubtask.is_completed == True
    ).count()
    badges = [
        {
            "key": "streak_7", "icon": "light_mode", "title": "Ngọn Hải Đăng Bền Bỉ",
            "rule": "Streak 7 ngày học sâu liên tục",
            "unlocked": streak >= 7, "progress": min(100, int(streak / 7 * 100)),
            "detail": f"Hiện tại {streak}/7 ngày",
        },
        {
            "key": "pomodoro_20", "icon": "headphones", "title": "Bậc Thầy Sóng 432Hz",
            "rule": "Hoàn thành 20 phiên focus",
            "unlocked": total_sessions >= 20, "progress": min(100, int(total_sessions / 20 * 100)),
            "detail": f"Hiện tại {total_sessions}/20 phiên",
        },
        {
            "key": "sprint_10", "icon": "extension", "title": "Phân Rã Đồ Án",
            "rule": "Hoàn thành 10 micro-sprints",
            "unlocked": completed_subtasks >= 10, "progress": min(100, int(completed_subtasks / 10 * 100)),
            "detail": f"Hiện tại {completed_subtasks}/10 sprints",
        },
        {
            "key": "scholar_80", "icon": "history_edu", "title": "Liêm Chính Học Thuật",
            "rule": "Tỷ lệ hoàn thành nhiệm vụ ≥ 80%",
            "unlocked": completion_rate >= 80 and total_tasks > 0, "progress": completion_rate,
            "detail": f"Hiện tại {completion_rate}%",
        },
        {
            "key": "circadian_90", "icon": "wb_twilight", "title": "Thức Tỉnh Sớm",
            "rule": "Điểm đồng bộ sinh học ≥ 90",
            "unlocked": circadian_score >= 90, "progress": min(100, circadian_score),
            "detail": f"Hiện tại {circadian_score} điểm",
        },
    ]

    # burnout tính từ xao nhãng trung bình thay vì text cứng
    avg_distr = (sum(s.distractions_count for s in all_sessions) / len(all_sessions)) if all_sessions else 0
    if avg_distr <= 1:
        burnout = "Cực kỳ thấp (Vùng an toàn)"
    elif avg_distr <= 2:
        burnout = "Thấp (Ổn định)"
    else:
        burnout = "Trung bình (Cần thêm nghỉ ngơi)"

    return {
        "range": selected,
        "weekly_focus_hours": weekly_focus_hours,
        "week_days": week_days_labels,
        "total_week_hours": total_week_hours,
        "circadian_alignment_score": circadian_score,
        "task_completion_rate": completion_rate,
        "current_streak_days": streak,
        "subject_radar": subject_radar,
        "subject_details": subject_details,
        "badges": badges,
        "total_sessions": total_sessions,
        "total_focus_minutes": total_focus_min,
        "completed_subtasks": completed_subtasks,
        "zen_efficiency_index": min(99, max(0, 80 + streak)) if (streak or circadian_score) else 0,
        "burnout_risk": burnout
    }
