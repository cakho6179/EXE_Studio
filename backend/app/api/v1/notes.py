from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.cache import cached_response
from app.models.entities import User, Note
from app.api.v1.auth import get_current_user

router = APIRouter()


class NoteCreate(BaseModel):
    title: str
    content: Optional[str] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


@router.get("/")
@cached_response(ttl=30)
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


@router.patch("/{note_id}")
def update_note(
    note_id: str,
    note_in: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Không tìm thấy ghi chú.")
    if note_in.title is not None:
        title = note_in.title.strip()
        if title:
            note.title = title[:255]
    if note_in.content is not None:
        note.content = note_in.content
    db.commit()
    db.refresh(note)
    return {"status": "success", "id": note.id, "title": note.title, "content": note.content}


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
