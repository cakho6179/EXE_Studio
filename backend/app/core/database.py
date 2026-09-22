from sqlalchemy import create_engine, text
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


def _tcp_reachable(host: str, port: int, timeout: float = 5.0) -> bool:
    """Kiểm tra nhanh TCP có kết nối được tới DB host không (không cần driver)."""
    import socket
    try:
        infos = socket.getaddrinfo(host, port, socket.AF_INET)
    except Exception:
        return False
    for info in infos:
        ip = info[4][0]
        s = socket.socket()
        s.settimeout(timeout)
        try:
            s.connect((ip, port))
            return True
        except Exception:
            continue
        finally:
            s.close()
    return False


def _sqlite_fallback_engine():
    """
    Fallback an toàn khi Postgres (Supabase) không kết nối được (project bị pause,
    mạng chặn port 5432/6543...): tạo engine SQLite local thay vì crash khi import.

    Chỉ áp dụng ở chế độ development — production vẫn fail nhanh để vận hành biết rõ.
    """
    global SessionLocal
    from datetime import datetime as _dt
    # ASCII-only: console Windows (cp1252) sẽ crash UnicodeEncodeError nếu in tiếng Việt có dấu
    print(
        f"[Studio AI] !! WARNING {_dt.now().strftime('%H:%M:%S')}: Postgres host unreachable. "
        "Supabase project may be PAUSED (free tier auto-pauses after ~7 days inactive) "
        "or your network blocks port 5432/6543.",
        flush=True,
    )
    print(
        "[Studio AI] -> AUTO-FALLBACK to local SQLite (studi_ai.db) so the server still runs. "
        "Postgres data will NOT be visible until Supabase is restored "
        "(dashboard.supabase.com -> Restore project).",
        flush=True,
    )
    engine = create_engine(
        "sqlite:///./studi_ai.db",
        connect_args={"check_same_thread": False},
        pool_pre_ping=False,
        echo=False,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine


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
    if _is_sqlite:
        engine = create_engine(
            _db_url,
            connect_args={"check_same_thread": False},
            pool_size=1,
            max_overflow=0,
            pool_pre_ping=False,
            pool_recycle=240,
            echo=False,
        )
    else:
        # Kiểm tra TCP trước khi dựng engine: Supabase pause/bị chặn -> fallback
        # thay vì để create_all crash khi import app (server không thể khởi động).
        from urllib.parse import urlparse
        _p = urlparse(_db_url)
        _host, _port = _p.hostname, _p.port or 5432
        if settings.ENV != "production" and not _tcp_reachable(_host, _port, timeout=5.0):
            engine = _sqlite_fallback_engine()
            _is_sqlite = True
        else:
            engine = create_engine(
                _db_url,
                # SQLite local: giữ single-connection. Neon/Postgres xa (US): pool lớn để
                # request song song không xếp hàng; tắt pre-ping (đỡ 1 RTT/checkout, recycle
                # 4 phút đã đảm bảo kết nối tươi) vì mỗi RTT VN->US ~250ms.
                connect_args=_pg_args,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=False,
                pool_recycle=240,
                echo=False,
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


def check_database_health() -> dict:
    """Chẩn đoán DB đang dùng cho /health (SELECT 1)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "dialect": engine.dialect.name,
            "database": (engine.url.database or "studi_ai.db"),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)[:200]}
