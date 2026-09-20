"""
Gửi email OTP qua SMTP (TLS). Nếu chưa cấu hình SMTP_HOST -> log console (chế độ demo).
"""
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

OTP_EMAIL_TEMPLATE = """
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#f8fafc;border-radius:16px;">
  <h2 style="color:#0f172a;margin:0 0 8px;">🌊 Stuđiô AI — Mã xác minh</h2>
  <p style="color:#475569;font-size:14px;">Mã xác minh của bạn là:</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0369a1;background:#e0f2fe;border-radius:12px;padding:12px 0;text-align:center;margin:12px 0;">{code}</div>
  <p style="color:#64748b;font-size:12px;">Mã có hiệu lực 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
</div>
"""


def send_otp_email(to_email: str, code: str) -> bool:
    """Gửi OTP qua SMTP nếu đã cấu hình; luôn trả True ở chế độ demo (log console)."""
    if not settings.SMTP_HOST:
        print(f"[Studio AI][DEMO] SMTP chưa cấu hình -> OTP cho {to_email}: {code}")
        return True
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Mã xác minh Stuđiô AI (hiệu lực 10 phút)"
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to_email
        msg.attach(MIMEText(f"Mã xác minh của bạn là: {code}", "plain", "utf-8"))
        msg.attach(MIMEText(OTP_EMAIL_TEMPLATE.format(code=code), "html", "utf-8"))

        context = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls(context=context)
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, [to_email], msg.as_string())
        return True
    except Exception as e:
        print(f"[Studio AI] Gửi email thất bại ({e}). OTP cho {to_email}: {code}")
        return False
