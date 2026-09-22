from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator

# Auth Schemas
class UserRegister(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    university: Optional[str] = "ĐHQG TP.HCM"
    major: Optional[str] = "Công nghệ Thông tin"
    academic_year: Optional[int] = Field(default=3, ge=1, le=7)

class UserLogin(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: dict

class UserProfileOut(BaseModel):
    chronotype: str
    wake_up_time: str
    bed_time: str
    peak_start_time: str
    peak_end_time: str
    target_daily_focus_hours: float
    target_gpa: float
    preferred_study_style: str

    class Config:
        from_attributes = True

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    university: Optional[str] = None
    major: Optional[str] = None
    academic_year: Optional[int] = None
    chronotype: Optional[str] = None
    wake_up_time: Optional[str] = None
    bed_time: Optional[str] = None
    peak_start_time: Optional[str] = None
    peak_end_time: Optional[str] = None
    target_daily_focus_hours: Optional[float] = None
    target_gpa: Optional[float] = None
    preferred_study_style: Optional[str] = None

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    student_id: Optional[str] = None
    university: str
    major: str
    academic_year: int
    is_email_verified: bool
    is_onboarded: bool = False
    avatar_url: Optional[str] = None
    profile: Optional[UserProfileOut] = None

    class Config:
        from_attributes = True


# Task & AI Deconstructor Schemas
class MicroSubtaskOut(BaseModel):
    id: str
    task_id: str
    title: str
    estimated_minutes: int
    pomodoro_count: int
    order_index: int
    is_completed: bool
    recommended_circadian_window: str

    class Config:
        from_attributes = True

import re

def parse_flexible_datetime(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        v = v.strip()
        if not v or v.lower() in ("none", "null", "undefined"):
            return None
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            pass
        for fmt in (
            "%Y-%m-%dT%H:%M",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %I:%M %p",
            "%m/%d/%Y %I:%M %p",
            "%d/%m/%Y %H:%M",
            "%m/%d/%Y %H:%M",
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%m/%d/%Y",
        ):
            try:
                return datetime.strptime(v, fmt)
            except Exception:
                continue
    return None

def normalize_priority(v):
    if not v:
        return "high"
    v_clean = str(v).strip().lower()
    if any(k in v_clean for k in ("cao", "high", "urgent", "khẩn", "gấp")):
        return "high"
    if any(k in v_clean for k in ("thấp", "low", "tự học", "nhe")):
        return "low"
    if any(k in v_clean for k in ("tiêu chuẩn", "medium", "trung bình", "vừa", "standard")):
        return "medium"
    return "medium"

def normalize_complexity(v):
    if not v:
        return "medium"
    v_clean = str(v).strip().lower()
    if "review" in v_clean or "ôn tập" in v_clean:
        return "review"
    if any(k in v_clean for k in ("complex", "đồ án", "bài báo", "lớn", "phức tạp")):
        return "complex"
    if any(k in v_clean for k in ("simple", "lab", "ngắn", "dễ", "đơn giản")):
        return "simple"
    if any(k in v_clean for k in ("medium", "tiểu luận", "vừa")):
        return "medium"
    return v_clean[:50] if len(v_clean) <= 50 else "medium"


class MicroSubtaskCreate(BaseModel):
    title: str = "Micro-sprint tập trung"
    estimated_minutes: int = 25
    pomodoro_count: int = 1
    recommended_circadian_window: Optional[str] = "Khung giờ vàng chiều (14:00 - 16:30)"

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, v):
        if not v or not str(v).strip():
            return "Micro-sprint tập trung 25p"
        return str(v).strip()[:255]

    @field_validator("estimated_minutes", mode="before")
    @classmethod
    def clean_estimated_minutes(cls, v):
        if v is None:
            return 25
        m = re.search(r"\d+", str(v))
        return int(m.group(0)) if m else 25

    @field_validator("pomodoro_count", mode="before")
    @classmethod
    def clean_pomodoro_count(cls, v):
        if v is None:
            return 1
        m = re.search(r"\d+", str(v))
        return max(1, int(m.group(0))) if m else 1

class TaskCreate(BaseModel):
    title: str = Field(default="Nhiệm vụ học tập mới", min_length=1, max_length=255)
    description: Optional[str] = None
    # None = không rõ môn -> backend gán nhóm "Chung" (tránh đếm nhầm vào môn AI ở analytics)
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    deadline: Optional[datetime] = None
    priority: Optional[str] = "high"
    complexity: Optional[str] = "medium"
    status: Optional[str] = None
    subtasks: Optional[List[MicroSubtaskCreate]] = []

    @field_validator("title", mode="before")
    @classmethod
    def clean_task_title(cls, v):
        if not v or not str(v).strip():
            return "Nhiệm vụ học tập mới"
        return str(v).strip()[:255]

    @field_validator("deadline", mode="before")
    @classmethod
    def parse_deadline(cls, v):
        return parse_flexible_datetime(v)

    @field_validator("priority", mode="before")
    @classmethod
    def parse_priority(cls, v):
        return normalize_priority(v)

    @field_validator("complexity", mode="before")
    @classmethod
    def parse_complexity(cls, v):
        return normalize_complexity(v)

    @field_validator("subtasks", mode="before")
    @classmethod
    def clean_subtasks_list(cls, v):
        if not v:
            return []
        res = []
        for item in v:
            if isinstance(item, str):
                res.append({"title": item})
            elif isinstance(item, dict):
                res.append(item)
            else:
                res.append(item)
        return res

class TaskOut(BaseModel):
    id: str
    title: str
    description: Optional[str]
    subject_name: str
    subject_code: str
    deadline: Optional[datetime]
    priority: str
    complexity: str
    status: str
    total_sprints: int
    completed_sprints: int
    created_at: datetime
    subtasks: List[MicroSubtaskOut] = []

    class Config:
        from_attributes = True

class AIDeconstructRequest(BaseModel):
    title: str
    description: Optional[str] = None
    subject: Optional[str] = None
    deadline: Optional[str] = None
    complexity: Optional[str] = "medium"

class AISubtaskItem(BaseModel):
    title: str
    estimated_minutes: int
    pomodoro_count: int
    recommended_circadian_window: str
    cognitive_load: str # high, medium, light

class AIDeconstructResponse(BaseModel):
    task_title: str
    summary_advice: str
    circadian_tip: str
    total_estimated_minutes: int
    subtasks: List[AISubtaskItem]
    ai_source: str = "heuristic"  # gemini | heuristic (key chết/hết quota -> heuristic)


# ---- Task update & schedule event update ----
class TaskUpdate(BaseModel):
    """Cập nhật một phần thông tin nhiệm vụ (mọi trường đều optional)."""
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    deadline: Optional[datetime] = None
    priority: Optional[str] = None
    complexity: Optional[str] = None
    status: Optional[str] = None
    total_sprints: Optional[int] = Field(default=None, ge=0, le=200)

    @field_validator("deadline", mode="before")
    @classmethod
    def parse_update_deadline(cls, v):
        return parse_flexible_datetime(v)

    @field_validator("priority", mode="before")
    @classmethod
    def parse_update_priority(cls, v):
        return normalize_priority(v) if v is not None else None

    @field_validator("complexity", mode="before")
    @classmethod
    def parse_update_complexity(cls, v):
        return normalize_complexity(v) if v is not None else None

class MicroSubtaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=255)
    estimated_minutes: Optional[int] = Field(default=None, ge=5, le=120)
    pomodoro_count: Optional[int] = Field(default=None, ge=1, le=8)
    order_index: Optional[int] = Field(default=None, ge=0)
    is_completed: Optional[bool] = None
    recommended_circadian_window: Optional[str] = None


# Focus Schemas
class FocusSessionCreate(BaseModel):
    task_id: Optional[str] = None
    planned_minutes: int = Field(default=25, ge=1, le=240)
    actual_minutes: int = Field(default=25, ge=0, le=240)
    distractions_count: int = Field(default=0, ge=0, le=100)
    # None/"" = học không nhạc (không đè mặc định âm thanh lên mọi phiên — bug tương quan analytics)
    ambient_sound_used: Optional[str] = None
    notes: Optional[str] = None
    # Tự tick micro-sprint kế tiếp khi hoàn thành phiên (client chọn, mặc định True giữ tương thích)
    complete_next_subtask: bool = True

class FocusSessionOut(BaseModel):
    id: str
    task_id: Optional[str]
    planned_minutes: int
    actual_minutes: int
    distractions_count: int
    ambient_sound_used: Optional[str]
    notes: Optional[str]
    created_at: datetime
    focus_score: Optional[int] = 85

    class Config:
        from_attributes = True


# Schedule Schemas
class ScheduleEventCreate(BaseModel):
    task_id: Optional[str] = None
    title: str = Field(min_length=2, max_length=255)
    description: Optional[str] = None
    event_date: Optional[str] = None # YYYY-MM-DD
    start_time: str # "14:00"
    end_time: str   # "15:30"
    event_type: str = "deep_work"
    is_circadian_optimized: bool = True

class ScheduleEventUpdate(BaseModel):
    """Cập nhật một phần sự kiện lịch: đổi giờ, đổi tên, đánh dấu hoàn thành..."""
    task_id: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = None
    event_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    event_type: Optional[str] = None
    is_completed: Optional[bool] = None
    is_circadian_optimized: Optional[bool] = None

class ScheduleEventOut(BaseModel):
    id: str
    task_id: Optional[str]
    title: str
    description: Optional[str]
    event_date: Optional[str] = None
    start_time: str
    end_time: str
    event_type: str
    is_completed: bool
    is_circadian_optimized: bool

    class Config:
        from_attributes = True


# Circadian Pulse Schemas
class CircadianPulseOut(BaseModel):
    pulse_percent: int
    status_text: str
    is_golden_hour: bool
    current_brainwave_state: str
    golden_hour_range: str
    recommendation: str

class CircadianInsightItem(BaseModel):
    title: str
    detail: str
    confidence: str
    action_label: str
    suggested_time: str


# AI Advisor Schemas
class ChatMessageCreate(BaseModel):
    content: Optional[str] = None
    message: Optional[str] = None
    context_type: Optional[str] = None
    include_profile: Optional[bool] = True
    include_tasks: Optional[bool] = True

class ChatMessageOut(BaseModel):
    id: str
    session_id: str
    sender: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
