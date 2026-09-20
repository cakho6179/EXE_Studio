"""
Rate limiter đơn giản (sliding window, in-memory) - đủ dùng cho tiến trình đơn SQLite.
Chống brute-force: đăng nhập sai liên tiếp và đoán mã OTP.
"""
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self):
        self._hits = defaultdict(deque)

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        """Cho phép request? Ghi nhận lượt thử nếu cho phép. Trả False khi vượt limit."""
        now = time.monotonic()
        dq = self._hits[key]
        while dq and now - dq[0] > window_seconds:
            dq.popleft()
        if len(dq) >= limit:
            return False
        dq.append(now)
        return True

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)


# Đăng nhập: tối đa 10 lần/email mỗi 5 phút (đếm cả lần thành công để chống dò mật khẩu)
login_limiter = SlidingWindowLimiter()
LOGIN_LIMIT = 10
LOGIN_WINDOW = 5 * 60

# Xác thực OTP: tối đa 5 lần thử/email mỗi 10 phút
otp_verify_limiter = SlidingWindowLimiter()
OTP_VERIFY_LIMIT = 5
OTP_VERIFY_WINDOW = 10 * 60

# Yêu cầu gửi OTP: tối đa 3 lần/email mỗi 10 phút
otp_send_limiter = SlidingWindowLimiter()
OTP_SEND_LIMIT = 3
OTP_SEND_WINDOW = 10 * 60
