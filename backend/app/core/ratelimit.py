"""
Rate limiter đơn giản (sliding window, in-memory) - đủ dùng cho tiến trình đơn SQLite.
Chống brute-force: đăng nhập sai liên tiếp và đoán mã OTP.

Chống phình RAM: khi dict vượt ngưỡng MAX_KEYS, tự dọn các deque rỗng (key của
email thử sai trước đây nằm vĩnh viễn -> memory leak chậm).
"""
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    MAX_KEYS = 10_000  # ngưỡng kích hoạt dọn rác

    def __init__(self):
        self._hits = defaultdict(deque)

    def _gc(self, now: float) -> None:
        """Dọn key rỗng khi dict phình (gọi thưa, chi phí thấp)."""
        if len(self._hits) <= self.MAX_KEYS:
            return
        for k in [k for k, dq in self._hits.items() if not dq]:
            self._hits.pop(k, None)
        # Vẫn quá tải (bot quét hàng loạt) -> xóa luôn entry cũ hơn window dài nhất (10 phút)
        if len(self._hits) > self.MAX_KEYS * 2:
            cutoff = now - 600
            for k in [k for k, dq in self._hits.items()
                      if not dq or (dq and dq[-1] < cutoff)]:
                self._hits.pop(k, None)

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        """Cho phép request? Ghi nhận lượt thử nếu cho phép. Trả False khi vượt limit."""
        now = time.monotonic()
        dq = self._hits[key]
        while dq and now - dq[0] > window_seconds:
            dq.popleft()
        allowed = len(dq) < limit
        if allowed:
            dq.append(now)
        self._gc(now)  # dọn cả khi chặn (bot bị chặn vẫn làm phình dict)
        return allowed

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
