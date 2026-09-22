import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Stuđiô AI"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"
    # Bí mật đọc từ .env (không hardcode key thật trong source, tối thiểu 32 ký tự theo RFC 7518)
    SECRET_KEY: str = "dev-only-change-me-super-secret-jwt-key-32chars-min"
    ALGORITHM: str = "HS256"
    # Access token ngắn hạn + refresh token dài hạn (an toàn hơn JWT 7 ngày)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    DATABASE_URL: str = "sqlite:///./studi_ai.db"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

    # Google OAuth: đặt GOOGLE_CLIENT_ID trong .env để bật kiểm tra aud cho id_token thật
    GOOGLE_CLIENT_ID: str = ""

    # SMTP gửi email OTP (bỏ trống = chỉ log OTP ra console - chế độ demo)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Stuđiô AI <no-reply@studio-ai.local>"

    # Chế độ demo học thuật: trả dev_code trong response /auth/forgot để hoàn tất luồng không cần email.
    # ĐẶT FALSE khi deploy production (bắt buộc cấu hình SMTP).
    OTP_RETURN_DEV_CODE: bool = True

    # TODO(FIX-LATER): Bypass OTP tạm thời — mã cố định 123456 được chấp nhận ở
    # /auth/verify-otp và /auth/reset-password mà không cần tra DB.
    # ĐẶT FALSE (hoặc ENV=production) khi làm xong luồng OTP thật.
    ALLOW_FIXED_OTP: bool = True
    FIXED_OTP_CODE: str = "123456"

    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:5500",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
