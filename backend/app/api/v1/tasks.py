from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.entities import User, Task, MicroSubtask
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
    completed = db.query(MicroSubtask).filter(
        MicroSubtask.task_id == task.id,
        MicroSubtask.is_completed == True
    ).count()
    task.completed_sprints = completed
    if task.total_sprints > 0 and completed >= task.total_sprints:
        task.status = "completed"
    elif task.status == "completed":
        task.status = "in_progress"


@router.get("/", response_model=List[TaskOut])
def get_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Task).filter(Task.user_id == current_user.id)
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
    task = Task(
        user_id=current_user.id,
        title=task_in.title,
        description=task_in.description,
        subject_name=task_in.subject_name or "Trí tuệ nhân tạo",
        subject_code=task_in.subject_code or "CS301",
        deadline=task_in.deadline,
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

    if "deadline" in data and data["deadline"] is None:
        # Cho phép xóa deadline bằng cách gửi null
        task.deadline = None
        data.pop("deadline")

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
    db.delete(task)
    db.commit()
    return {"message": "Đã xóa nhiệm vụ thành công."}


@router.post("/ai-decompose", response_model=AIDeconstructResponse)
async def ai_decompose_task(payload: AIDeconstructRequest):
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
    remaining = db.query(MicroSubtask).filter(MicroSubtask.task_id == parent.id).count()
    parent.total_sprints = max(remaining, 1)
    _recalc_task_progress(db, parent)
    db.commit()
    return {"status": "success", "message": "Đã xóa micro-sprint."}
