from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# Engine setup
def _resolve_db_url(raw: str) -> str:
    # psycopg v3 (pipeline mode, ít RTT hơn psycopg2 qua pooler xa) nếu có sẵn;
    # nếu không, giữ nguyên scheme để SQLAlchemy dùng psycopg2.
    if raw.startswith("postgresql://"):
        try:
            import psycopg  # noqa: F401
            return "postgresql+psycopg://" + raw[len("postgresql://"):]
        except ImportError:
            return raw
    return raw


try:
    _is_sqlite = settings.DATABASE_URL.startswith("sqlite")
    _db_url = _resolve_db_url(settings.DATABASE_URL)
    _pg_args = {
        "connect_timeout": 10,
        # Giữ TCP alive để pooler ít cắt kết nối idle (đỡ handshake lại)
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
    }
    engine = create_engine(
        _db_url,
        # SQLite local: giữ single-connection. Neon/Postgres xa (US): pool lớn để
        # request song song không xếp hàng; tắt pre-ping (đỡ 1 RTT/checkout, recycle
        # 4 phút đã đảm bảo kết nối tươi) vì mỗi RTT VN->US ~250ms.
        connect_args={"check_same_thread": False} if _is_sqlite else _pg_args,
        pool_size=1 if _is_sqlite else 10,
        max_overflow=0 if _is_sqlite else 20,
        pool_pre_ping=False,
        pool_recycle=240,
        echo=False
    )
except ModuleNotFoundError as e:
    # Lỗi thường gặp: DATABASE_URL postgres nhưng chưa pip install psycopg2-binary.
    # Ném lỗi rõ ràng thay vì traceback dài trong vòng lặp --reload của uvicorn.
    raise RuntimeError(
        f"[Studio AI] Thiếu driver DB cho URL đã cấu hình ({e.name}). "
        "Chạy: pip install -r requirements.txt "
        "(hoặc đặt DATABASE_URL sqlite để chạy local)."
    ) from e

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Dependency for obtaining database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
