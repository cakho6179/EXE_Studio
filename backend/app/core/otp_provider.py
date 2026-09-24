"""
Module quản lý Provider gửi mã OTP (Email / 3rd-Party API).
Hỗ trợ Kiến trúc Adapter:
1. Resend REST API (Khuyên dùng: HTTPS port 443, tỷ lệ vào Inbox cao, không bị chặn port SMTP).
2. SMTP TLS (Gmail App Password, Brevo, SendGrid SMTP, v.v.).
3. Dev Console Provider (Fallback tự động khi chạy local hoặc test offline).
"""

from abc import ABC, abstractmethod
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
import httpx

from app.core.config import settings

OTP_HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã xác thực Stuđiô AI</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 32px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #312e81 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
      <div style="font-size: 32px; line-height: 1; margin-bottom: 8px;">🌊</div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Stuđiô AI</h1>
      <p style="margin: 6px 0 0; font-size: 13px; color: #93c5fd; font-weight: 500;">Khoa học Não bộ &amp; Nhịp sinh học Đại học</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px 28px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 700; color: #0f172a; text-align: center;">Mã xác minh tài khoản</h2>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569; text-align: center;">
        Sử dụng mã OTP bên dưới để hoàn tất đăng ký hoặc đặt lại mật khẩu học tập của bạn:
      </p>

      <!-- OTP Box -->
      <div style="background: #f0fdf4; border: 2px dashed #86efac; border-radius: 14px; padding: 18px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #166534; display: inline-block; padding-left: 10px;">
          {code}
        </span>
      </div>

      <div style="background: #eff6ff; border-radius: 12px; padding: 12px 16px; margin-bottom: 24px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; font-size: 12px; color: #1e40af; line-height: 1.5;">
          ⏱️ <strong>Thời hạn:</strong> Mã có hiệu lực trong vòng <strong>10 phút</strong>.<br>
          🔒 <strong>Bảo mật:</strong> Tuyệt đối không chia sẻ mã này cho bất kỳ ai khác.
        </p>
      </div>

      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8; text-align: center;">
        Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc thông báo ngay cho đội ngũ hỗ trợ.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
      <p style="margin: 0; font-size: 11px; color: #64748b;">
        © 2026 Stuđiô AI • Dự án Khởi nghiệp EXE201 • ĐHQG TP.HCM
      </p>
    </div>
  </div>
</body>
</html>
"""


class BaseOtpProvider(ABC):
    """Lớp cơ sở cho các nhà cung cấp OTP."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def send_otp(self, to_email: str, code: str) -> bool:
        """Gửi mã OTP tới email người nhận. Trả về True nếu thành công, False nếu thất bại."""
        pass


class ResendOtpProvider(BaseOtpProvider):
    """
    Tích hợp 3rd-Party Resend REST API (HTTPS port 443).
    Endpoint: https://api.resend.com/emails
    """

    def __init__(self, api_key: str, from_email: str):
        self.api_key = api_key
        self.from_email = from_email

    @property
    def provider_name(self) -> str:
        return "resend_api"

    def send_otp(self, to_email: str, code: str) -> bool:
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "from": self.from_email,
            "to": [to_email],
            "subject": f"[{code}] Mã xác minh tài khoản Stuđiô AI",
            "html": OTP_HTML_TEMPLATE.format(code=code),
            "text": f"Mã xác minh Stuđiô AI của bạn là: {code}. Mã có hiệu lực trong 10 phút.",
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                if resp.status_code in (200, 201):
                    data = resp.json()
                    email_id = data.get("id", "ok")
                    print(f"[Stuđiô AI][Resend] Đã gửi OTP thành công tới {to_email} (ID: {email_id})")
                    return True
                else:
                    print(f"[Stuđiô AI][Resend] Lỗi {resp.status_code}: {resp.text}")
                    return False
        except Exception as e:
            print(f"[Stuđiô AI][Resend] Ngoại lệ khi gọi Resend API: {e}")
            return False


class SmtpOtpProvider(BaseOtpProvider):
    """
    Tích hợp SMTP (TLS port 587) - Hỗ trợ Gmail App Password hoặc máy chủ SMTP chuẩn.
    """

    def __init__(self, host: str, port: int, user: str, password: str, from_email: str):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.from_email = from_email

    @property
    def provider_name(self) -> str:
        return "smtp_tls"

    def send_otp(self, to_email: str, code: str) -> bool:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[{code}] Mã xác minh tài khoản Stuđiô AI"
            msg["From"] = self.from_email
            msg["To"] = to_email
            msg.attach(MIMEText(f"Mã xác minh của bạn là: {code}. Hiệu lực 10 phút.", "plain", "utf-8"))
            msg.attach(MIMEText(OTP_HTML_TEMPLATE.format(code=code), "html", "utf-8"))

            context = ssl.create_default_context()
            with smtplib.SMTP(self.host, self.port, timeout=10) as server:
                server.starttls(context=context)
                server.login(self.user, self.password)
                server.sendmail(self.from_email, [to_email], msg.as_string())
            print(f"[Stuđiô AI][SMTP] Đã gửi OTP thành công qua SMTP tới {to_email}")
            return True
        except Exception as e:
            print(f"[Stuđiô AI][SMTP] Gửi email thất bại: {e}")
            return False


class DevConsoleOtpProvider(BaseOtpProvider):
    """
    Provider dùng cho chế độ Local Development / Testing.
    In mã OTP ra console/terminal để kiểm thử không phụ thuộc vào internet hay API Key bên thứ 3.
    """

    @property
    def provider_name(self) -> str:
        return "dev_console"

    def send_otp(self, to_email: str, code: str) -> bool:
        print("\n" + "=" * 60)
        print(f"🌊 [Stuđiô AI][DEV CONSOLE OTP]")
        print(f"👉 Người nhận: {to_email}")
        print(f"🔑 MÃ XÁC MINH OTP: >>> {code} <<<")
        print(f"⏱️  Hiệu lực: 10 phút")
        print("=" * 60 + "\n")
        return True


def get_otp_provider() -> BaseOtpProvider:
    """
    Factory function tự động nhận diện và khởi tạo Provider phù hợp:
    1. Nếu cấu hình OTP_PROVIDER == 'resend' hoặc có RESEND_API_KEY -> Dùng Resend REST API.
    2. Nếu cấu hình OTP_PROVIDER == 'smtp' hoặc có SMTP_HOST -> Dùng SMTP TLS.
    3. Mặc định fallback về DevConsoleOtpProvider.
    """
    pref = (getattr(settings, "OTP_PROVIDER", "auto") or "auto").lower()
    resend_key = getattr(settings, "RESEND_API_KEY", "") or ""
    smtp_host = getattr(settings, "SMTP_HOST", "") or ""

    if (pref == "resend" or pref == "auto") and resend_key:
        from_email = getattr(settings, "RESEND_FROM_EMAIL", "Stuđiô AI <onboarding@resend.dev>")
        return ResendOtpProvider(api_key=resend_key, from_email=from_email)

    if (pref == "smtp" or pref == "auto") and smtp_host:
        return SmtpOtpProvider(
            host=smtp_host,
            port=getattr(settings, "SMTP_PORT", 587),
            user=getattr(settings, "SMTP_USER", ""),
            password=getattr(settings, "SMTP_PASSWORD", ""),
            from_email=getattr(settings, "SMTP_FROM", "Stuđiô AI <no-reply@studio-ai.local>"),
        )

    return DevConsoleOtpProvider()


def send_otp(to_email: str, code: str) -> bool:
    """Hàm tiện ích gửi OTP qua provider hiện hành."""
    provider = get_otp_provider()
    return provider.send_otp(to_email, code)
