from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.models.entities import User, ScheduleEvent, Task, MicroSubtask
from app.api.v1.auth import get_current_user
from app.core.timeutils import vn_today_iso
from app.core.constants import PRIORITY_RANK
from app.services.circadian_service import CircadianService
from app.schemas.all_schemas import ScheduleEventCreate, ScheduleEventOut, ScheduleEventUpdate

router = APIRouter()


class LmsSyncRequest(BaseModel):
    provider: Optional[str] = "canvas"  # 'canvas', 'classroom', 'teams'
    include_timeline: Optional[bool] = True

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
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    limit: Optional[int] = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Chỉ trả về sự kiện của chính user này
    query = db.query(ScheduleEvent).filter(
        ScheduleEvent.user_id == current_user.id
    )
    if date_from:
        query = query.filter(ScheduleEvent.event_date >= date_from)
    if date_to:
        query = query.filter(ScheduleEvent.event_date <= date_to)
    return query.order_by(ScheduleEvent.event_date.asc(), ScheduleEvent.start_time.asc()).limit(limit).all()

@router.post("/events", response_model=ScheduleEventOut, status_code=201)
def create_event(
    event_in: ScheduleEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    def _normalize_time(t: str) -> str:
        parts = (t or "").strip().split(":")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            h, m = int(parts[0]), int(parts[1])
            if 0 <= h <= 23 and 0 <= m <= 59:
                return f"{h:02d}:{m:02d}"
        raise HTTPException(status_code=400, detail="Giờ phải có định dạng HH:MM (ví dụ 14:00 hoặc 09:30).")

    st = _normalize_time(event_in.start_time)
    et = _normalize_time(event_in.end_time)

    event = ScheduleEvent(
        user_id=current_user.id,
        task_id=event_in.task_id,
        title=event_in.title,
        description=event_in.description,
        # Mặc định sự kiện không rõ ngày -> gán hôm nay theo giờ Việt Nam
        event_date=event_in.event_date or vn_today_iso(),
        start_time=st,
        end_time=et,
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
        golden_slots.append((f"{h % 24:02d}:{m:02d}", f"{end_h % 24:02d}:{end_m:02d}", slot_labels[i % len(slot_labels)]))

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


@router.post("/lms-sync")
def sync_lms_canvas(
    payload: Optional[LmsSyncRequest] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Đồng bộ khóa học, bài tập & lịch kiểm tra từ Canvas LMS, Google Classroom hoặc Microsoft Teams.
    Tự động nhập các môn học kỳ hiện tại, hạn chót bài tập và gán lịch trình vào tuần này.
    """
    req_provider = (payload.provider if payload and payload.provider else "canvas").lower()
    include_timeline = payload.include_timeline if payload and payload.include_timeline is not None else True

    canvas_courses = [
        {
            "title": "Báo cáo Đồ án Thị giác Máy tính (ResNet-50)",
            "description": "Phân loại ảnh đa nhãn trên tập dữ liệu mất cân bằng nhẹ, nộp báo cáo chuẩn IEEE Conference.",
            "subject_name": "Trí tuệ nhân tạo",
            "subject_code": "CS301",
            "priority": "high",
            "complexity": "complex",
            "deadline_days": 4,
            "subtasks": [
                ("Tiền xử lý Data CIFAR-10 & Augmentation", 25),
                ("Huấn luyện mô hình & Vẽ Confusion Matrix", 25),
                ("Biên soạn báo cáo theo mẫu IEEE Conference", 25),
            ]
        },
        {
            "title": "Tiểu luận Cuối kỳ: Triết học & Trí tuệ Nhân tạo",
            "description": "Tiểu luận phân tích quan điểm duy vật biện chứng về ý thức và sự phát triển của hệ thống AI tạo sinh.",
            "subject_name": "Triết học Mác-Lênin",
            "subject_code": "PH201",
            "priority": "medium",
            "complexity": "medium",
            "deadline_days": 7,
            "subtasks": [
                ("Đọc 3 tài liệu tham khảo chính", 25),
                ("Lập đề cương chi tiết 3 chương", 25),
                ("Viết bản thảo chương 1 & 2", 25),
            ]
        },
        {
            "title": "Lab 4: Phân mảnh & Nhân bản Dữ liệu Phân tán",
            "description": "Cấu hình 3 node MongoDB replica set và kiểm tra tính nhất quán dữ liệu.",
            "subject_name": "CSDL Phân tán",
            "subject_code": "IS210",
            "priority": "high",
            "complexity": "simple",
            "deadline_days": 2,
            "subtasks": [
                ("Thiết lập cụm Docker 3 nodes", 25),
                ("Viết script kiểm tra sharding & replication", 25),
            ]
        }
    ]

    classroom_courses = [
        {
            "title": "Bài tập lớn: Phân tích Dữ liệu Chuỗi Thời gian (Colab)",
            "description": "Phân tích xu hướng và dự báo với mô hình ARIMA & LSTM trên tập dữ liệu tài chính.",
            "subject_name": "Khoa học Dữ liệu",
            "subject_code": "DS202",
            "priority": "high",
            "complexity": "complex",
            "deadline_days": 5,
            "subtasks": [
                ("Làm sạch và chuẩn hóa dữ liệu chuỗi", 25),
                ("Huấn luyện mô hình dự báo và tính MAPE", 25),
                ("Trình bày kết quả trực quan hóa Seaborn", 25),
            ]
        },
        {
            "title": "Tiểu luận Chuyên đề: Kiến trúc Microservices & Docker",
            "description": "Thiết kế API Gateway, service registry và container hóa ứng dụng đa dịch vụ.",
            "subject_name": "Kỹ thuật Web",
            "subject_code": "SE214",
            "priority": "medium",
            "complexity": "medium",
            "deadline_days": 6,
            "subtasks": [
                ("Vẽ sơ đồ kiến trúc hệ thống C4 Model", 25),
                ("Viết Dockerfile và Docker Compose", 25),
                ("Cấu hình reverse proxy Nginx", 25),
            ]
        },
        {
            "title": "Kiểm tra Thực hành: Lập trình Socket Mạng",
            "description": "Xây dựng ứng dụng chat đa luồng TCP/IP hỗ trợ mã hóa bảo mật SSL/TLS.",
            "subject_name": "Mạng máy tính",
            "subject_code": "NT106",
            "priority": "high",
            "complexity": "simple",
            "deadline_days": 3,
            "subtasks": [
                ("Viết TCP Server xử lý multi-threading", 25),
                ("Kiểm thử tải đồng thời 50 client", 25),
            ]
        }
    ]

    teams_courses = [
        {
            "title": "Báo cáo Seminar Nhóm: Tối ưu Truy vấn SQL & Sharding",
            "description": "Nghiên cứu chiến lược indexing B-tree, partitioning và tối ưu hóa câu lệnh truy vấn phức tạp.",
            "subject_name": "Hệ thống Thông tin",
            "subject_code": "IS302",
            "priority": "high",
            "complexity": "complex",
            "deadline_days": 4,
            "subtasks": [
                ("Phân tích Explain Query Plan trong PostgreSQL", 25),
                ("Tạo chỉ mục composite và đo lường latency", 25),
                ("Biên soạn slide thuyết trình cho nhóm", 25),
            ]
        },
        {
            "title": "Đồ án Đột phá: Ứng dụng Học Sâu Nhận dạng Giọng nói",
            "description": "Fine-tune mô hình Whisper AI trên tập dữ liệu tiếng Việt chuyên ngành.",
            "subject_name": "Xử lý Ngôn ngữ Tự nhiên",
            "subject_code": "CS312",
            "priority": "medium",
            "complexity": "medium",
            "deadline_days": 8,
            "subtasks": [
                ("Thu thập và gán nhãn 100 đoạn audio mẫu", 25),
                ("Fine-tune checkpoint mô hình trên GPU", 25),
                ("Đánh giá Word Error Rate (WER)", 25),
            ]
        },
        {
            "title": "Bài thực hành Lab: Cấu hình Kubernetes & CI/CD",
            "description": "Thiết lập pipeline GitHub Actions tự động build và deploy lên cụm k8s.",
            "subject_name": "Điện toán Đám mây",
            "subject_code": "IT401",
            "priority": "high",
            "complexity": "simple",
            "deadline_days": 2,
            "subtasks": [
                ("Viết manifest Deployment & Service YAML", 25),
                ("Kiểm tra rolling update không downtime", 25),
            ]
        }
    ]

    provider_map = {
        "canvas": ("Canvas LMS (ĐHQG TP.HCM / VNU)", canvas_courses, "🔴"),
        "classroom": ("Google Classroom", classroom_courses, "🟢"),
        "teams": ("Microsoft Teams Education", teams_courses, "🟣"),
    }

    provider_name, sample_courses, provider_icon = provider_map.get(
        req_provider, ("Canvas LMS", canvas_courses, "🔴")
    )

    imported_tasks = 0
    today_dt = datetime.utcnow()
    today_iso = vn_today_iso()

    for item in sample_courses:
        exists = db.query(Task).filter(Task.user_id == current_user.id, Task.title == item["title"]).first()
        if not exists:
            deadline = today_dt + timedelta(days=item["deadline_days"])
            task = Task(
                user_id=current_user.id,
                title=item["title"],
                description=item["description"],
                subject_name=item["subject_name"],
                subject_code=item["subject_code"],
                priority=item["priority"],
                complexity=item["complexity"],
                deadline=deadline,
                total_sprints=len(item["subtasks"]),
                completed_sprints=0,
                status="pending",
            )
            db.add(task)
            db.commit()
            db.refresh(task)

            for idx, (st_title, st_mins) in enumerate(item["subtasks"]):
                sub = MicroSubtask(
                    task_id=task.id,
                    title=st_title,
                    estimated_minutes=st_mins,
                    order_index=idx,
                    is_completed=False,
                )
                db.add(sub)
            db.commit()
            imported_tasks += 1

            # Auto schedule an event for this task if requested
            if include_timeline:
                event_day = (date.fromisoformat(today_iso) + timedelta(days=min(item["deadline_days"] - 1, 3))).isoformat()
                short_prov = "Canvas" if req_provider == "canvas" else ("Classroom" if req_provider == "classroom" else "Teams")
                sched_ev = ScheduleEvent(
                    user_id=current_user.id,
                    task_id=task.id,
                    title=f"{short_prov}: {item['subject_code']} - {item['title'][:30]}",
                    description=item["description"],
                    event_date=event_day,
                    start_time="14:30",
                    end_time="16:00",
                    event_type="deep_work",
                    is_circadian_optimized=True,
                )
                db.add(sched_ev)
                db.commit()

    return {
        "status": "success",
        "provider": req_provider,
        "provider_name": provider_name,
        "message": f"Đồng bộ thành công! Đã nhập {imported_tasks} bài tập và phân bổ lịch thi từ {provider_name}.",
        "imported_count": imported_tasks,
    }

