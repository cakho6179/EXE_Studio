import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    student_id = Column(String(50), nullable=True)
    university = Column(String(255), default="ĐHQG TP.HCM")
    major = Column(String(255), default="Công nghệ Thông tin")
    academic_year = Column(Integer, default=3)
    is_email_verified = Column(Boolean, default=False)
    avatar_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    focus_sessions = relationship("FocusSession", back_populates="user", cascade="all, delete-orphan")
    schedule_events = relationship("ScheduleEvent", back_populates="user", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    chronotype = Column(String(50), default="lark") # lark, owl, bear, dolphin
    wake_up_time = Column(String(10), default="06:30")
    bed_time = Column(String(10), default="23:00")
    peak_start_time = Column(String(10), default="14:00")
    peak_end_time = Column(String(10), default="16:30")
    target_daily_focus_hours = Column(Float, default=6.0)
    target_gpa = Column(Float, default=3.6)
    preferred_study_style = Column(String(50), default="pomodoro")

    user = relationship("User", back_populates="profile")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    subject_name = Column(String(255), default="Trí tuệ nhân tạo")
    subject_code = Column(String(50), default="CS301")
    deadline = Column(DateTime, nullable=True)
    priority = Column(String(50), default="high") # high, medium, low
    complexity = Column(String(50), default="medium")
    status = Column(String(50), default="in_progress") # pending, in_progress, completed
    total_sprints = Column(Integer, default=5)
    completed_sprints = Column(Integer, default=2)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="tasks")
    subtasks = relationship("MicroSubtask", back_populates="task", cascade="all, delete-orphan")


class MicroSubtask(Base):
    __tablename__ = "micro_subtasks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False)
    title = Column(String(255), nullable=False)
    estimated_minutes = Column(Integer, default=25)
    pomodoro_count = Column(Integer, default=1)
    order_index = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    recommended_circadian_window = Column(String(100), default="Khung giờ vàng chiều (14:00 - 16:30)")

    task = relationship("Task", back_populates="subtasks")


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=True)
    planned_minutes = Column(Integer, default=25)
    actual_minutes = Column(Integer, default=25)
    distractions_count = Column(Integer, default=0)
    ambient_sound_used = Column(String(100), default="Sóng Biển 432Hz")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="focus_sessions")


class ScheduleEvent(Base):
    __tablename__ = "schedule_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(String(255), nullable=True)
    event_date = Column(String(10), nullable=True) # YYYY-MM-DD, None = hôm nay/không ngày cụ thể
    start_time = Column(String(10), nullable=False) # e.g. "08:00"
    end_time = Column(String(10), nullable=False)   # e.g. "09:30"
    event_type = Column(String(50), default="class") # class, deep_work, break, self_study
    is_completed = Column(Boolean, default=False)
    is_circadian_optimized = Column(Boolean, default=True)

    user = relationship("User", back_populates="schedule_events")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), default="Tư vấn học thuật")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), nullable=False)
    sender = Column(String(20), default="user") # user, advisor
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")


class MoodEntry(Base):
    """Nhật ký cảm xúc hằng ngày của sinh viên (thay cho lưu localStorage)."""
    __tablename__ = "mood_entries"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    mood = Column(String(50), nullable=False) # alpha_flow, calm_focus, need_break, rest_mode
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class OtpCode(Base):
    """Mã OTP khôi phục/xác thực email (hết hạn 10 phút, dùng 1 lần)."""
    __tablename__ = "otp_codes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), index=True, nullable=False)
    code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Document(Base):
    """Giáo trình sinh viên nạp lên (metadata trong DB, file trên đĩa)."""
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    size_bytes = Column(Integer, default=0)
    text_chars = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Note(Base):
    """Ghi chú nhanh của sinh viên (thay card ghi chú tĩnh ở trang tasks)."""
    __tablename__ = "notes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
