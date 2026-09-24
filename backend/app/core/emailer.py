"""
Giao diện gửi email OTP — chuyển tiếp tới dynamic OTP Provider (Resend / SMTP / Console).
"""

from app.core.otp_provider import send_otp, OTP_HTML_TEMPLATE as OTP_EMAIL_TEMPLATE


def send_otp_email(to_email: str, code: str) -> bool:
    """Gửi OTP qua dynamic provider đã cấu hình (Resend REST API, SMTP TLS hoặc Dev Console)."""
    return send_otp(to_email, code)

