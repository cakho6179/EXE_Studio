from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import User, UserProfile
from app.api.v1.auth import get_current_user

router = APIRouter()


class OnboardingComplete(BaseModel):
    answers: dict = {}


CHRONO_MAP = {
    "morning": "lark", "lark": "lark", "peak_morning": "lark",
    "evening": "owl", "owl": "owl", "peak_evening": "owl",
    "intermediate": "intermediate", "peak_afternoon": "intermediate",
    "bear": "intermediate", "dolphin": "owl",
    "hummingbird": "intermediate", "chim_ruoi": "intermediate",
}

FOCUS_HOURS_MAP = {"short": 3.0, "medium": 5.0, "long": 7.0}
STYLE_MAP = {"short": "pomodoro", "medium": "pomodoro_50", "long": "ultradian_90"}
BED_MAP = {"lark": "22:30", "intermediate": "23:00", "owl": "00:00"}
WAKE_MAP = {"lark": "05:30", "intermediate": "06:30", "owl": "07:30"}


def _pick(answers: dict, *keys) -> Optional[str]:
    for k in keys:
        v = answers.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, list) and v:
            first = v[0]
            if isinstance(first, str) and first.strip():
                return first.strip()
    return None


@router.post("/complete")
def complete_onboarding(
    payload: OnboardingComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    answers = payload.answers or {}

    major = _pick(answers, "major", "nganh", "field")
    if major:
        current_user.major = major[:255]

    chrono_raw = (_pick(answers, "chronotype", "energy_peak", "peak") or "intermediate").lower()
    chronotype = CHRONO_MAP.get(chrono_raw, "intermediate")

    profile = current_user.profile
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    profile.chronotype = chronotype
    profile.wake_up_time = _pick(answers, "wake_up_time") or WAKE_MAP.get(chronotype, "06:30")
    profile.bed_time = _pick(answers, "bed_time") or BED_MAP.get(chronotype, "23:00")

    focus_raw = (_pick(answers, "focus_duration", "focus") or "").lower()
    if focus_raw in FOCUS_HOURS_MAP:
        profile.target_daily_focus_hours = FOCUS_HOURS_MAP[focus_raw]
        profile.preferred_study_style = STYLE_MAP[focus_raw]

    style = _pick(answers, "preferred_study_style", "study_style")
    if style:
        profile.preferred_study_style = style[:50]

    goal = _pick(answers, "goal")
    current_user.is_onboarded = True
    db.commit()

    return {
        "status": "success",
        "message": "Đã lưu hồ sơ nhịp sinh học!",
        "chronotype": chronotype,
        "goal": goal,
    }
