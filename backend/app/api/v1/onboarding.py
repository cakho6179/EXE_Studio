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
# Map giá trị intensity của wizard React (relaxed/balanced/deep/sprint)
INTENSITY_STYLE_MAP = {"relaxed": "pomodoro", "balanced": "pomodoro_50", "deep": "deep_work", "sprint": "sprint"}
# Map slot buổi của wizard -> khung đỉnh năng lượng
SLOT_PEAK_MAP = {
    "morning": ("08:30", "11:30"),
    "afternoon": ("14:00", "16:30"),
    "night": ("20:00", "22:30"),
}
BED_MAP = {"lark": "22:30", "intermediate": "23:00", "owl": "00:00"}
WAKE_MAP = {"lark": "05:30", "intermediate": "06:30", "owl": "07:30"}
# Khung giờ vàng mặc định theo chronotype (khớp GOLDEN_RANGES của CircadianService)
# dùng khi wizard không gửi slot (tránh profile thiếu peak_time -> auto-balance sai)
PEAK_FALLBACK_MAP = {
    "lark": ("08:30", "11:30"),
    "intermediate": ("10:00", "12:00"),
    "owl": ("20:30", "23:30"),
}


def _pick_num(answers: dict, *keys) -> Optional[float]:
    for k in keys:
        v = answers.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
        if isinstance(v, str):
            m = v.strip().replace(",", ".")
            num = "".join(ch for ch in m if ch.isdigit() or ch == ".").strip(".")
            try:
                if num and float(num) > 0:
                    return float(num)
            except ValueError:
                pass
    return None


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
    else:
        # Ưu tiên target_hours (slider người dùng kéo tay) trước focus_hours (mặc định theo goal)
        hours = _pick_num(answers, "target_hours", "focus_hours", "daily_goal", "target_daily_focus_hours")
        if hours:
            profile.target_daily_focus_hours = min(16.0, max(0.5, hours))

    style = _pick(answers, "preferred_study_style", "study_style")
    if style:
        profile.preferred_study_style = style[:50]
    else:
        intensity = (_pick(answers, "intensity") or "").lower()
        if intensity in INTENSITY_STYLE_MAP:
            profile.preferred_study_style = INTENSITY_STYLE_MAP[intensity]

    slot = (_pick(answers, "circadian_slot", "slot") or "").lower()
    if slot in SLOT_PEAK_MAP:
        profile.peak_start_time, profile.peak_end_time = SLOT_PEAK_MAP[slot]
    elif not (profile.peak_start_time and profile.peak_end_time):
        # Không có slot và profile chưa có peak -> dùng khung vàng theo chronotype
        profile.peak_start_time, profile.peak_end_time = PEAK_FALLBACK_MAP.get(
            chronotype, ("10:00", "12:00")
        )

    goal = _pick(answers, "goal")
    current_user.is_onboarded = True
    db.commit()
    from app.core.cache import invalidate_user_by_id
    invalidate_user_by_id(current_user.id)

    return {
        "status": "success",
        "message": "Đã lưu hồ sơ nhịp sinh học!",
        "chronotype": chronotype,
        "goal": goal,
    }
