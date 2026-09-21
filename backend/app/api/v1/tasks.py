from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.core.cache import cached_response
from app.models.entities import User, Task, MicroSubtask, ScheduleEvent, FocusSession
from app.api.v1.auth import get_current_user
from app.services.ai_service import AIService
from app.schemas.all_schemas import (
    TaskCreate,
    TaskOut,
    TaskUpdate,
    MicroSubtaskCreate,
    MicroSubtaskOut,
    MicroSubtaskUpdate,
    AIDeconstructRequest,
    AIDeconstructResponse,
)

router = APIRouter()


def _get_owned_task(db: Session, task_id: str, user: User) -> Task:
    """Lấy task thuộc quyền sở hữu của user, 404 nếu không tồn tại/không phải của user."""
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhiệm vụ.")
    return task


def _recalc_task_progress(db: Session, task: Task) -> None:
    """Tính lại completed_sprints và status từ danh sách subtasks."""
    total_subtasks = db.query(MicroSubtask).filter(MicroSubtask.task_id == task.id).count()
    if total_subtasks == 0:
        if task.status == "completed":
            task.completed_sprints = task.total_sprints or 1
        else:
            task.completed_sprints = 0
        return

    completed = db.query(MicroSubtask).filter(
        MicroSubtask.task_id == task.id,
        MicroSubtask.is_completed == True
    ).count()
    task.completed_sprints = completed
    task.total_sprints = max(total_subtasks, 1)
    if completed >= total_subtasks:
        task.status = "completed"
    else:
        task.status = "in_progress"


@router.get("/", response_model=List[TaskOut])
@cached_response(ttl=30)
def get_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Task).options(selectinload(Task.subtasks)).filter(Task.user_id == current_user.id)
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    # Sắp mới nhất trước; deadline gần nhất lên đầu trong cùng mức ưu tiên
    return (
        query.order_by(Task.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

@router.post("/", response_model=TaskOut, status_code=201)
def create_task(
    task_in: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dl = task_in.deadline
    if dl is not None and getattr(dl, 'tzinfo', None) is not None:
        from datetime import timezone
        dl = dl.astimezone(timezone.utc).replace(tzinfo=None)

    task = Task(
        user_id=current_user.id,
        title=task_in.title,
        description=task_in.description,
        subject_name=task_in.subject_name or "Trí tuệ nhân tạo",
        subject_code=task_in.subject_code or "CS301",
        deadline=dl,
        priority=task_in.priority or "high",
        complexity=task_in.complexity or "medium",
        status="in_progress",
        total_sprints=len(task_in.subtasks) if task_in.subtasks else 1,
        completed_sprints=0
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    if task_in.subtasks:
        for idx, sub in enumerate(task_in.subtasks):
            subtask = MicroSubtask(
                task_id=task.id,
                title=sub.title,
                estimated_minutes=sub.estimated_minutes,
                pomodoro_count=sub.pomodoro_count,
                order_index=idx,
                recommended_circadian_window=sub.recommended_circadian_window or "Khung giờ vàng chiều (14:00 - 16:30)"
            )
            db.add(subtask)
        db.commit()
        db.refresh(task)

    return task


@router.get("/{task_id}", response_model=TaskOut)
def get_task_detail(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return _get_owned_task(db, task_id, current_user)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    task_in: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sửa thông tin nhiệm vụ: tên, hạn chót, mức ưu tiên, trạng thái..."""
    task = _get_owned_task(db, task_id, current_user)
    data = task_in.model_dump(exclude_unset=True)

    if "deadline" in data:
        if data["deadline"] is None:
            task.deadline = None
            data.pop("deadline")
        elif getattr(data["deadline"], 'tzinfo', None) is not None:
            from datetime import timezone
            data["deadline"] = data["deadline"].astimezone(timezone.utc).replace(tzinfo=None)

    for field, value in data.items():
        setattr(task, field, value)

    # Đánh dấu hoàn thành thủ công -> tính lại từ subtasks để giữ nhất quán
    _recalc_task_progress(db, task)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = _get_owned_task(db, task_id, current_user)
    # Gỡ liên kết task_id ở các sự kiện lịch và phiên focus trước khi xóa task để bảo vệ toàn vẹn khóa ngoại trên PostgreSQL
    db.query(ScheduleEvent).filter(ScheduleEvent.task_id == task.id).update({"task_id": None})
    db.query(FocusSession).filter(FocusSession.task_id == task.id).update({"task_id": None})
    db.delete(task)
    db.commit()
    return {"message": "Đã xóa nhiệm vụ thành công."}


@router.post("/deduplicate")
def deduplicate_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Tự động quét và gộp các nhiệm vụ trùng tên của sinh viên.
    Giữ lại bản ghi có tiến độ cao nhất (completed_sprints lớn nhất, hoặc mới nhất),
    xóa an toàn các bản ghi trùng lặp trong cơ sở dữ liệu.
    """
    user_tasks = db.query(Task).filter(Task.user_id == current_user.id).all()
    grouped = {}
    for t in user_tasks:
        norm_title = (t.title or "").strip().lower()
        if not norm_title:
            continue
        grouped.setdefault(norm_title, []).append(t)

    removed_count = 0
    for norm_title, t_list in grouped.items():
        if len(t_list) > 1:
            # Ưu tiên bản ghi có completed_sprints lớn nhất, sau đó là ngày tạo mới nhất
            t_list.sort(key=lambda x: (x.completed_sprints or 0, getattr(x, 'created_at', None) or datetime.min), reverse=True)
            to_delete = t_list[1:]
            for t in to_delete:
                # Xóa subtasks con nếu có
                db.query(MicroSubtask).filter(MicroSubtask.task_id == t.id).delete()
                # Gỡ task_id ở các ScheduleEvent liên quan để tránh ràng buộc khóa ngoại
                db.query(ScheduleEvent).filter(ScheduleEvent.task_id == t.id).update({"task_id": None})
                # Gỡ task_id ở các FocusSession liên quan
                db.query(FocusSession).filter(FocusSession.task_id == t.id).update({"task_id": None})
                db.delete(t)
                removed_count += 1

    db.commit()
    remaining_count = db.query(Task).filter(Task.user_id == current_user.id).count()

    return {
        "status": "success",
        "removed_count": removed_count,
        "remaining_count": remaining_count,
        "message": f"Đã dọn dẹp và gộp thành công {removed_count} nhiệm vụ trùng lặp.",
    }


@router.post("/ai-decompose", response_model=AIDeconstructResponse)
async def ai_decompose_task(
    payload: AIDeconstructRequest,
    current_user: User = Depends(get_current_user)
):
    """
    AI Deconstructor v3.2: Analyzes an assignment and decomposes into micro-sprints.
    """
    result = await AIService.decompose_task(
        title=payload.title,
        description=payload.description,
        subject=payload.subject,
        deadline=payload.deadline
    )
    return result


@router.post("/{task_id}/subtasks", response_model=List[MicroSubtaskOut])
def add_subtask(
    task_id: str,
    sub_in: MicroSubtaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Thêm micro-sprint mới vào cuối danh sách của nhiệm vụ."""
    task = _get_owned_task(db, task_id, current_user)
    next_order = db.query(MicroSubtask).filter(
        MicroSubtask.task_id == task.id
    ).count()
    subtask = MicroSubtask(
        task_id=task.id,
        title=sub_in.title,
        estimated_minutes=sub_in.estimated_minutes,
        pomodoro_count=sub_in.pomodoro_count,
        order_index=next_order,
        recommended_circadian_window=sub_in.recommended_circadian_window or "Khung giờ vàng chiều (14:00 - 16:30)"
    )
    db.add(subtask)
    task.total_sprints = next_order + 1
    db.commit()
    db.refresh(task)
    return task.subtasks


@router.patch("/subtasks/{subtask_id}/toggle", response_model=MicroSubtaskOut)
def toggle_subtask(
    subtask_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    subtask = db.query(MicroSubtask).filter(MicroSubtask.id == subtask_id).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhiệm vụ con.")
    # Kiểm tra quyền sở hữu qua task cha
    parent = db.query(Task).filter(Task.id == subtask.task_id, Task.user_id == current_user.id).first()
    if not parent:
        raise HTTPException(status_code=403, detail="Bạn không có quyền sửa nhiệm vụ này.")

    subtask.is_completed = not subtask.is_completed
    _recalc_task_progress(db, parent)
    db.commit()
    db.refresh(subtask)
    return subtask


@router.patch("/subtasks/{subtask_id}", response_model=MicroSubtaskOut)
def update_subtask(
    subtask_id: str,
    sub_in: MicroSubtaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sửa nội dung micro-sprint (tên, thời lượng, thứ tự...)."""
    subtask = db.query(MicroSubtask).filter(MicroSubtask.id == subtask_id).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhiệm vụ con.")
    parent = db.query(Task).filter(Task.id == subtask.task_id, Task.user_id == current_user.id).first()
    if not parent:
        raise HTTPException(status_code=403, detail="Bạn không có quyền sửa nhiệm vụ này.")

    for field, value in sub_in.model_dump(exclude_unset=True).items():
        setattr(subtask, field, value)
    db.commit()
    db.refresh(subtask)
    return subtask


@router.delete("/subtasks/{subtask_id}")
def delete_subtask(
    subtask_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Xóa một micro-sprint và tính lại tổng sprint của nhiệm vụ."""
    subtask = db.query(MicroSubtask).filter(MicroSubtask.id == subtask_id).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhiệm vụ con.")
    parent = db.query(Task).filter(Task.id == subtask.task_id, Task.user_id == current_user.id).first()
    if not parent:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa nhiệm vụ này.")

    db.delete(subtask)
    db.flush()
    remaining = db.query(MicroSubtask).filter(MicroSubtask.task_id == parent.id).count()
    parent.total_sprints = max(remaining, 1)
    _recalc_task_progress(db, parent)
    db.commit()
    return {"status": "success", "message": "Đã xóa micro-sprint."}
