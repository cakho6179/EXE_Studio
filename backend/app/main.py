import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models.entities import (
    User, UserProfile, Task, MicroSubtask, ScheduleEvent,
    FocusSession, ChatSession, ChatMessage, MoodEntry, Note, StudyPlan,
)
from app.api.v1 import auth, circadian, tasks, focus, schedule, advisor, audio, analytics, notifications, moods, notes, study_plans, onboarding

# Initialize DB Tables — không crash import khi DB xa (Supabase/Neon) unreachable:
# app vẫn boot để phục vụ /docs + static + thông báo lỗi rõ ở từng API.
DB_READY = False
try:
    Base.metadata.create_all(bind=engine)
    DB_READY = True
except Exception as e:
    # Print ASCII-only: console Windows (cp1252) crash voi tieng Viet co dau
    print(f"[Studio AI] WARNING: DB unreachable at startup ({type(e).__name__}). "
          f"App still boots (docs/static OK). Detail: {str(e)[:200]}")

if "dev-only" in settings.SECRET_KEY:
    print("[Studio AI] WARNING: Using default SECRET_KEY. Set SECRET_KEY in backend/.env for production.")


def _migrate_schedule_event_date():
    """Thêm cột event_date cho DB cũ (SQLite không tự ALTER qua create_all)."""
    from sqlalchemy import inspect, text
    try:
        cols = [c["name"] for c in inspect(engine).get_columns("schedule_events")]
        if "event_date" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE schedule_events ADD COLUMN event_date VARCHAR(10)"))
            print("[Studio AI] Migrated schedule_events.event_date")
    except Exception as e:
        print(f"[Studio AI] Migration check skipped: {type(e).__name__}")


_migrate_schedule_event_date() if DB_READY else None


def _migrate_fk_indexes():
    """Tạo index cho các cột FK tra cứu nhiều (idempotent)."""
    from sqlalchemy import text
    wanted = [
        ("idx_tasks_user", "tasks", "user_id"),
        ("idx_focus_user", "focus_sessions", "user_id"),
        ("idx_schedule_user", "schedule_events", "user_id"),
        ("idx_chat_user", "chat_sessions", "user_id"),
        ("idx_mood_user", "mood_entries", "user_id"),
        ("idx_otp_email", "otp_codes", "email"),
        ("idx_subtask_task", "micro_subtasks", "task_id"),
    ]
    try:
        with engine.begin() as conn:
            for name, table, col in wanted:
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({col})"))
    except Exception as e:
        print(f"[Studio AI] Index migration skipped: {type(e).__name__}")


_migrate_fk_indexes() if DB_READY else None


def _migrate_document_columns():
    """Bổ sung cột extracted_text cho bảng documents nếu chưa có (DB cũ)."""
    from sqlalchemy import inspect, text
    try:
        cols = [c["name"] for c in inspect(engine).get_columns("documents")]
        if "extracted_text" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE documents ADD COLUMN extracted_text TEXT"))
            print("[Studio AI] Migrated documents.extracted_text")
    except Exception as e:
        print(f"[Studio AI] documents migration skipped: {type(e).__name__}")


_migrate_document_columns() if DB_READY else None


def _migrate_user_columns():
    """Bổ sung cột is_onboarded cho bảng users nếu chưa có (check-first, êm log)."""
    from sqlalchemy import inspect, text
    try:
        cols = [c["name"] for c in inspect(engine).get_columns("users")]
        if "is_onboarded" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_onboarded BOOLEAN DEFAULT 0"))
            print("[Studio AI] Migrated users.is_onboarded")
    except Exception as e:
        print(f"[Studio AI] User migration skipped: {type(e).__name__}")


_migrate_user_columns() if DB_READY else None


def _backfill_event_dates():
    """Sự kiện cũ chưa có event_date -> gán hôm nay (để grid tuần hiển thị đúng)."""
    from sqlalchemy import text
    from datetime import date
    try:
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE schedule_events SET event_date = :today WHERE event_date IS NULL"),
                {"today": date.today().isoformat()},
            )
    except Exception as e:
        print(f"[Studio AI] event_date backfill skipped: {type(e).__name__}")


_backfill_event_dates() if DB_READY else None

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API cho Stuđiô AI - Không gian học tập tĩnh lặng & Điều phối nhịp sinh học",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS setup: phải khớp origins thật với allow_credentials=True
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    try:
        body = await request.body()
        body_str = body.decode("utf-8", errors="ignore")
    except Exception:
        body_str = "<could not read body>"
    print(f"[Studio AI][422 Validation Error] path={request.url.path} errors={exc.errors()} body={body_str}")
    # FIX: exc.errors() chứa ctx.error (object ValueError) không JSON-serialize được
    # -> chính handler ném TypeError, client nhận lỗi vỡ thay vì 422 sạch
    safe_errors = [{k: v for k, v in e.items() if k != "ctx"} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": safe_errors})

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Sau mọi request ghi thành công -> bump cache version của user để GET sau tươi ngay.
# (DB Neon xa, RTT ~250ms: cache GET 45s + bump-on-write cho cảm giác tức thì.)
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.cache import bump
from app.core.security import decode_access_token


class _BumpCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        try:
            if (
                request.method in ("POST", "PATCH", "PUT", "DELETE")
                and request.url.path.startswith(settings.API_V1_STR)
                and 200 <= response.status_code < 300
            ):
                auth = request.headers.get("authorization", "")
                if auth.startswith("Bearer "):
                    uid = decode_access_token(auth[7:].strip())
                    if uid:
                        bump(uid)
        except Exception:
            pass
        return response


app.add_middleware(_BumpCacheMiddleware)

# Seed Initial Demo Data
def _seed_schedule_events(db, user):
    """Lịch trình mẫu persist trong DB (thay mock frontend). Idempotent."""
    if db.query(ScheduleEvent).filter(ScheduleEvent.user_id == user.id).count() > 0:
        return
    # "Hôm nay" theo lịch VN (date.today() lệch múi giờ khi deploy server UTC)
    from app.core.timeutils import vn_today_iso
    today_iso = vn_today_iso()
    seed_events = [
        ("Lớp Học Máy (Machine Learning)", "Giảng đường B204 • Gradient Descent & Backpropagation", "08:00", "09:30", "class", True),
        ("Tự học Thư viện - Cấu trúc dữ liệu", "Cây AVL & Đồ thị có hướng • Flashcard AI", "10:00", "11:30", "self_study", True),
        ("Nghỉ trưa & Thư giãn Calm Break", "Ăn nhẹ & Nghe sóng não Alpha 10Hz", "12:00", "13:00", "study_break", False),
        ("Báo cáo Đồ án AI: Đánh giá mô hình CNN", "Khung giờ vàng • Ma trận nhầm lẫn (Confusion Matrix)", "14:00", "15:30", "deep_work", False),
        ("Họp Nhóm - Đồ án Công nghệ Web", "Google Meet • Kiến trúc RESTful API", "16:00", "17:00", "class", False),
    ]
    for title, desc, st, et, etype, done in seed_events:
        db.add(ScheduleEvent(
            user_id=user.id, title=title, description=desc,
            event_date=today_iso,
            start_time=st, end_time=et, event_type=etype,
            is_completed=done, is_circadian_optimized=True,
        ))
    db.commit()


def _seed_focus_week(db, user):
    """Phiên focus 7 ngày qua để analytics tính số liệu thật. Idempotent."""
    if db.query(FocusSession).filter(FocusSession.user_id == user.id).count() > 0:
        return
    from datetime import datetime as _dt, timedelta as _td
    tasks = db.query(Task).filter(Task.user_id == user.id).order_by(Task.created_at.asc()).all()
    t_a = tasks[0].id if tasks else None
    t_b = tasks[1].id if len(tasks) > 1 else t_a
    now = _dt.utcnow()
    week_plan = [
        (6, [(25, 25, 0, "Sóng Biển 432Hz"), (50, 45, 1, "Mưa Rào Hải Đăng")]),
        (5, [(25, 25, 0, "Sóng Biển 432Hz"), (25, 20, 2, "Sóng Biển 432Hz")]),
        (4, [(50, 50, 1, "Sóng Alpha 528Hz"), (25, 25, 0, "Sóng Biển 432Hz")]),
        (3, [(25, 25, 1, "Mưa Rào Hải Đăng"), (45, 40, 1, "Sóng Biển 432Hz")]),
        (2, [(50, 50, 0, "Sóng Biển 432Hz"), (25, 25, 0, "Sóng Alpha 528Hz")]),
        (1, [(25, 22, 2, "Sóng Biển 432Hz"), (50, 48, 1, "Mưa Rào Hải Đăng")]),
        (0, [(25, 25, 0, "Sóng Biển 432Hz"), (50, 30, 1, "Sóng Biển 432Hz")]),
    ]
    for days_ago, sessions in week_plan:
        day = now - _td(days=days_ago)
        for i, (planned, actual, distr, sound) in enumerate(sessions):
            ts = day.replace(hour=9 + i * 5, minute=0, second=0, microsecond=0)
            db.add(FocusSession(
                user_id=user.id, task_id=t_a if days_ago % 2 == 0 else t_b,
                planned_minutes=planned, actual_minutes=actual,
                distractions_count=distr, ambient_sound_used=sound,
                notes="Phiên seed khởi tạo", created_at=ts,
            ))
    db.commit()


def _seed_chat_history(db, user):
    """Lịch sử chat cố vấn mẫu. Idempotent."""
    if db.query(ChatSession).filter(ChatSession.user_id == user.id).count() > 0:
        return
    chat = ChatSession(user_id=user.id, title="Cố vấn Học thuật AI")
    db.add(chat)
    db.commit()
    db.refresh(chat)
    seed_msgs = [
        ("user", "Làm thế nào để cân bằng giữa làm đồ án và ôn thi cuối kỳ?"),
        ("advisor", "Chào Minh Châu! Hãy áp dụng chu kỳ Ultradian 90 phút: 2 hiệp Pomodoro 25p cho đồ án vào khung giờ vàng 14:00 – 16:30, và ôn lý thuyết vào buổi tối 19:30 – 21:00 nhé."),
        ("user", "Ma trận nhầm lẫn của mô hình em bị lệch giữa các lớp thì xử lý sao?"),
        ("advisor", "Khi Recall một lớp thấp, hãy kiểm tra lại mẫu huấn luyện lớp đó và áp dụng Data Augmentation (xoay ±15 độ, chỉnh sáng nhẹ). Dành 1 phiên Pomodoro khung giờ vàng để tinh chỉnh nhé!"),
    ]
    for sender, content in seed_msgs:
        db.add(ChatMessage(session_id=chat.id, sender=sender, content=content))
    db.commit()


def _seed_mood(db, user):
    if db.query(MoodEntry).filter(MoodEntry.user_id == user.id).count() > 0:
        return
    db.add(MoodEntry(user_id=user.id, mood="calm_focus", note="Sẵn sàng cho phiên chiều"))
    db.commit()


def _seed_notes(db, user):
    if db.query(Note).filter(Note.user_id == user.id).count() > 0:
        return
    db.add(Note(user_id=user.id, title="Ghi chú ResNet vs VGG16",
                content="ResNet dùng skip connection, Fulbright sâu hơn VGG mà ít tham số hơn."))
    db.add(Note(user_id=user.id, title="Bảng công thức Loss Functions",
                content="CrossEntropy cho phân loại, MSE cho hồi quy, Focal Loss cho mất cân bằng lớp."))
    db.commit()


def seed_demo_data():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "chau.nguyen@vnuhcm.edu.vn").first()
        if not user:
            print("[Studio AI] Khoi tao du lieu mau cho sinh vien Nguyen Minh Chau...")
            user = User(
                email="chau.nguyen@vnuhcm.edu.vn",
                password_hash=hash_password("password123"),
                full_name="Nguyễn Minh Châu",
                student_id="21120001",
                university="ĐHQG TP.HCM",
                major="Công nghệ Thông tin",
                academic_year=3,
                is_email_verified=True,
                is_onboarded=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            # Profile
            profile = UserProfile(
                user_id=user.id,
                chronotype="lark",
                wake_up_time="06:30",
                bed_time="23:00",
                peak_start_time="14:00",
                peak_end_time="16:30",
                target_daily_focus_hours=6.0,
                target_gpa=3.6,
                preferred_study_style="pomodoro"
            )
            db.add(profile)

            # Initial Tasks matching UI
            t1 = Task(
                user_id=user.id,
                title="Báo cáo Machine Learning (Môn Trí tuệ nhân tạo)",
                description="Phân tích chuyên sâu mô hình phân loại ảnh CIFAR-10 & Tinh chỉnh Hyperparameter",
                subject_name="Trí tuệ nhân tạo",
                subject_code="CS301",
                priority="high",
                complexity="complex",
                status="in_progress",
                total_sprints=5,
                completed_sprints=4
            )
            db.add(t1)
            db.commit()
            db.refresh(t1)

            subtasks_t1 = [
                ("Chuẩn bị dữ liệu mẫu & Augmentation", True, "Khung giờ sáng (08:30 - 09:30)"),
                ("Huấn luyện mô hình ResNet18", True, "Khung giờ sáng (10:00 - 11:30)"),
                ("Vẽ biểu đồ Loss & Accuracy", True, "Khung giờ chiều (13:30 - 14:00)"),
                ("Viết nhận xét ma trận nhầm lẫn (Confusion Matrix)", False, "Khung giờ vàng chiều (14:00 - 15:30)"),
                ("Rà soát quy chuẩn nộp bài IEEE", False, "Khung giờ tối (19:30 - 20:30)")
            ]
            for idx, (st_title, is_done, window) in enumerate(subtasks_t1):
                db.add(MicroSubtask(
                    task_id=t1.id,
                    title=st_title,
                    estimated_minutes=25,
                    pomodoro_count=1,
                    order_index=idx,
                    is_completed=is_done,
                    recommended_circadian_window=window
                ))

            # Task 2
            t2 = Task(
                user_id=user.id,
                title="Bài tập lớn Cơ sở dữ liệu nâng cao",
                description="Thiết kế lược đồ quan hệ chuẩn hóa 3NF và viết tập truy vấn SQL tối ưu hóa chỉ mục",
                subject_name="Cơ sở dữ liệu nâng cao",
                subject_code="IS210",
                priority="medium",
                complexity="medium",
                status="in_progress",
                total_sprints=4,
                completed_sprints=2
            )
            db.add(t2)
            db.commit()
            db.refresh(t2)

            subtasks_t2 = [
                ("Vẽ lược đồ ERD quan hệ chuẩn 3NF", True, "Khung giờ sáng"),
                ("Soạn DDL tạo bảng và dữ liệu mẫu", True, "Khung giờ chiều"),
                ("Viết 5 câu truy vấn phức tạp JOIN và GROUP BY", False, "Khung giờ tối"),
                ("Đo lường thời gian thực thi với EXPLAIN", False, "Khung giờ tối")
            ]
            for idx, (st_title, is_done, window) in enumerate(subtasks_t2):
                db.add(MicroSubtask(
                    task_id=t2.id,
                    title=st_title,
                    estimated_minutes=25,
                    pomodoro_count=1,
                    order_index=idx,
                    is_completed=is_done,
                    recommended_circadian_window=window
                ))

            # Task 3
            t3 = Task(
                user_id=user.id,
                title="Đọc tài liệu Xử lý ngôn ngữ tự nhiên (NLP)",
                description="Nghiên cứu kiến trúc Transformer và cơ chế Multi-Head Attention (Chương 4 & 5)",
                subject_name="Xử lý ngôn ngữ tự nhiên",
                subject_code="CS312",
                priority="low",
                complexity="simple",
                status="in_progress",
                total_sprints=2,
                completed_sprints=0
            )
            db.add(t3)
            db.commit()

            # --- Lịch trình / focus / chat / mood / notes mẫu (persist DB, idempotent) ---
            _seed_schedule_events(db, user)
            _seed_focus_week(db, user)
            _seed_chat_history(db, user)
            _seed_mood(db, user)
            _seed_notes(db, user)

            print("[Studio AI] Hoan tat nap du lieu mau khoi tao.")

        # --- Backfill cho DB đã tồn tại từ trước (thiếu dữ liệu mới) ---
        existing = db.query(User).filter(User.email == "chau.nguyen@vnuhcm.edu.vn").first()
        if existing:
            if not getattr(existing, "is_onboarded", False):
                existing.is_onboarded = True
                db.commit()
            _seed_schedule_events(db, existing)
            _seed_focus_week(db, existing)
            _seed_chat_history(db, existing)
            _seed_mood(db, existing)
            _seed_notes(db, existing)
    finally:
        db.close()

if DB_READY:
    try:
        seed_demo_data()
    except Exception as e:
        print(f"[Studio AI] WARNING: seed demo skipped ({type(e).__name__})")
else:
    print("[Studio AI] WARNING: skip seed demo (DB down)")

# Register API routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Auth"])
app.include_router(circadian.router, prefix=f"{settings.API_V1_STR}/circadian", tags=["Circadian"])
app.include_router(tasks.router, prefix=f"{settings.API_V1_STR}/tasks", tags=["Tasks"])
app.include_router(focus.router, prefix=f"{settings.API_V1_STR}/focus", tags=["Focus"])
app.include_router(schedule.router, prefix=f"{settings.API_V1_STR}/schedule", tags=["Schedule"])
app.include_router(advisor.router, prefix=f"{settings.API_V1_STR}/advisor", tags=["Advisor"])
app.include_router(audio.router, prefix=f"{settings.API_V1_STR}/audio", tags=["Audio"])
app.include_router(analytics.router, prefix=f"{settings.API_V1_STR}/analytics", tags=["Analytics"])
app.include_router(notifications.router, prefix=f"{settings.API_V1_STR}/notifications", tags=["Notifications"])
app.include_router(moods.router, prefix=f"{settings.API_V1_STR}/moods", tags=["Moods"])
app.include_router(notes.router, prefix=f"{settings.API_V1_STR}/notes", tags=["Notes"])
app.include_router(study_plans.router, prefix=f"{settings.API_V1_STR}/study-plans", tags=["StudyPlans"])
app.include_router(onboarding.router, prefix=f"{settings.API_V1_STR}/onboarding", tags=["Onboarding"])

# Mount Frontend static files
frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
# Frontend chuan duy nhat: build React xuat vao frontend/app
react_dist = frontend_dir / "app"
legacy_pages = Path(__file__).resolve().parent.parent.parent / "temp" / "pages-backup" / "pages"

# Ưu tiên assets chuẩn từ frontend/assets (1 nguồn duy nhất cho cả dev lẫn prod);
# bundle hash trong frontend/app/assets/* phục vụ qua mount /app bên dưới.
if frontend_dir.exists() and (frontend_dir / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dir / "assets")), name="assets")
elif react_dist.exists() and (react_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(react_dist / "assets")), name="react_assets")

if frontend_dir.exists():
    app.mount("/legacy-assets", StaticFiles(directory=str(frontend_dir / "assets")), name="legacy_assets")

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        from fastapi.responses import FileResponse
        icon = frontend_dir / "assets" / "images" / "logo.png"
        if icon.exists():
            return FileResponse(icon)
        return RedirectResponse(url="/")

if legacy_pages.exists():
    app.mount("/pages", StaticFiles(directory=str(legacy_pages)), name="pages")

from starlette.exceptions import HTTPException as StarletteHTTPException

class SinglePageApplication(StaticFiles):
    """Phục vụ SPA: mọi route con không phải asset vật lý tự động fallback về index.html."""
    def __init__(self, directory: str, index: str = "index.html"):
        super().__init__(directory=directory, html=True)
        self.index = index

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as ex:
            has_file_ext = "." in Path(path).name
            if ex.status_code == 404 and not has_file_ext:
                return await super().get_response(self.index, scope)
            raise

if react_dist.exists():
    app.mount("/app", SinglePageApplication(directory=str(react_dist)), name="app")

    @app.get("/")
    def root():
        return RedirectResponse(url="/app/")
else:
    @app.get("/")
    def root():
        # Chưa build React: mở Vite dev server (npm run dev trong frontend/)
        return RedirectResponse(url="http://localhost:5173/")


@app.get("/health", include_in_schema=False)
def health():
    """Healthcheck cho Docker/monitoring: luôn 200, kèm trạng thái DB."""
    db_status = "up"
    if not DB_READY:
        try:
            with engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")
            db_status = "up"
        except Exception as e:
            db_status = f"down: {type(e).__name__}"
    return {"status": "ok", "db": db_status}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
