from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# Engine setup
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

try:
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args=connect_args,
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
