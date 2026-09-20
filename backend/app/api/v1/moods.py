from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import get_db
from app.models.entities import User, MoodEntry
from app.api.v1.auth import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

ALLOWED_MOODS = {"alpha_flow", "calm_focus", "need_break", "rest_mode"}


class MoodCreate(BaseModel):
    mood: str
    note: Optional[str] = None


@router.post("/")
def save_mood(
    mood_in: MoodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if mood_in.mood not in ALLOWED_MOODS:
        raise HTTPException(status_code=400, detail="Trạng thái cảm xúc không hợp lệ.")
    entry = MoodEntry(user_id=current_user.id, mood=mood_in.mood, note=mood_in.note)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"status": "success", "message": "Đã lưu cảm xúc hôm nay!", "id": entry.id}


@router.get("/today")
def get_today_mood(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today_start = datetime.combine(datetime.utcnow().date(), datetime.min.time())
    entries = db.query(MoodEntry).filter(
        MoodEntry.user_id == current_user.id, MoodEntry.created_at >= today_start
    ).order_by(MoodEntry.created_at.desc()).all()
    return {
        "entries": [
            {"id": e.id, "mood": e.mood, "note": e.note, "created_at": e.created_at}
            for e in entries
        ]
    }
