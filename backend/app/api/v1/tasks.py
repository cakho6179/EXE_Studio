from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.entities import User, Task, MicroSubtask
from app.api.v1.auth import get_current_user
from app.services.ai_service import AIService
from app.schemas.all_schemas import (
    TaskCreate,
    TaskOut,
    AIDeconstructRequest,
    AIDeconstructResponse,
    MicroSubtaskOut
)

router = APIRouter()

@router.get("/", response_model=List[TaskOut])
def get_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Task).filter(Task.user_id == current_user.id)
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    return query.order_by(Task.created_at.desc()).all()

@router.post("/", response_model=TaskOut)
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
    db.commit()

    # Recalculate parent task completed sprints
    task = db.query(Task).filter(Task.id == subtask.task_id).first()
    if task:
        completed = db.query(MicroSubtask).filter(
            MicroSubtask.task_id == task.id,
            MicroSubtask.is_completed == True
        ).count()
        task.completed_sprints = completed
        if completed >= task.total_sprints and task.total_sprints > 0:
            task.status = "completed"
        else:
            task.status = "in_progress"
        db.commit()

    db.refresh(subtask)
    return subtask

@router.delete("/{task_id}")
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhiệm vụ để xóa.")
    db.delete(task)
    db.commit()
    return {"message": "Đã xóa nhiệm vụ thành công."}
