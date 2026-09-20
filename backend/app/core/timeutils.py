"""
Thống nhất múi giờ: DB lưu datetime NAIVE UTC, mọi ranh giới "hôm nay/hôm qua"
tính theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không có DST) rồi quy ngược về UTC để truy vấn.
Fix bug: phiên học từ 00:00-06:59 giờ VN trước đây bị tính nhầm sang hôm qua.
"""
from datetime import datetime, time, timedelta

VN_UTC_OFFSET = timedelta(hours=7)


def vn_now() -> datetime:
    """Thời điểm hiện tại theo giờ Việt Nam (naive)."""
    return datetime.utcnow() + VN_UTC_OFFSET


def to_utc_naive(dt: datetime) -> datetime:
    """Chuẩn hóa mọi datetime (aware hoặc naive) về naive-UTC để so sánh trong DB."""
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None) - dt.utcoffset()
    return dt


def utc_day_range_vn(days_ago: int = 0) -> tuple:
    """Trả về (bắt đầu, kết thúc-kêt-thúc) của 1 ngày lịch theo giờ VN, quy về naive UTC.

    Dùng để filter FocusSession.created_at (lưu naive UTC) đúng theo ngày lịch VN.
    """
    now_vn = vn_now()
    day = now_vn.date() - timedelta(days=days_ago)
    start_vn = datetime.combine(day, time.min)
    end_vn = start_vn + timedelta(days=1)
    return start_vn - VN_UTC_OFFSET, end_vn - VN_UTC_OFFSET


def vn_day_start_utc(days_ago: int = 0) -> datetime:
    """Mốc 00:00 giờ VN của ngày (hôm nay - days_ago), quy về naive UTC."""
    return utc_day_range_vn(days_ago)[0]


def vn_hour(dt_utc_naive: datetime) -> int:
    """Giờ trong ngày theo giờ VN của một mốc naive-UTC lưu trong DB."""
    return (dt_utc_naive + VN_UTC_OFFSET).hour


def vn_today_iso() -> str:
    """Ngày hôm nay theo giờ VN, định dạng YYYY-MM-DD."""
    return vn_now().date().isoformat()
