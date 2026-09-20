from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.models.entities import User, Note
from app.api.v1.auth import get_current_user

router = APIRouter()


class NoteCreate(BaseModel):
    title: str
    content: Optional[str] = None


@router.get("/")
def list_notes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notes = db.query(Note).filter(
        Note.user_id == current_user.id
    ).order_by(Note.created_at.desc()).limit(20).all()
    return {
        "notes": [
            {"id": n.id, "title": n.title, "content": n.content, "created_at": n.created_at}
            for n in notes
        ]
    }


@router.post("/")
def create_note(
    note_in: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    title = (note_in.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Tiêu đề ghi chú không được trống.")
    note = Note(user_id=current_user.id, title=title[:255], content=note_in.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"status": "success", "id": note.id, "title": note.title}


@router.delete("/{note_id}")
def delete_note(
    note_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Không tìm thấy ghi chú.")
    db.delete(note)
    db.commit()
    return {"status": "success", "message": "Đã xóa ghi chú."}
