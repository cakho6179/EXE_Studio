from datetime import datetime
from typing import Dict, Any, List

from app.core.timeutils import vn_now

class CircadianService:
    # Khung giờ vàng theo tuýp sinh học (thật, không cố định 1 mẫu)
    GOLDEN_RANGES = {
        "lark": ["08:30 - 11:30", "14:00 - 16:30"],
        "owl": ["16:00 - 18:30", "20:30 - 23:30"],
        "hummingbird": ["10:00 - 12:00", "15:00 - 17:30"],
        "bear": ["10:00 - 12:00", "14:00 - 16:30"],
    }

    # Từ vựng do các module khác lưu vào profile (onboarding từng lưu "intermediate",
    # DB cũ có thể còn "bear") -> ánh xạ về từ vựng chuẩn của GOLDEN_RANGES.
    # Không có alias này thì mọi user intermediate/bear/hummingbird đều rơi về khung lark.
    _ALIASES = {
        "intermediate": "hummingbird",
        "hummingbird": "hummingbird",
        "bear": "hummingbird",
        "peak_afternoon": "hummingbird",
        "dolphin": "owl",
    }

    @staticmethod
    def _norm_chronotype(chronotype: str) -> str:
        ctype = (chronotype or "lark").lower().strip()
        return CircadianService._ALIASES.get(ctype, ctype)

    @staticmethod
    def _in_range(hour: float, start: str, end: str) -> bool:
        def to_h(t: str) -> float:
            h, m = t.split(":")
            return int(h) + int(m) / 60.0
        s, e = to_h(start), to_h(end)
        if s <= e:
            return s <= hour < e
        return hour >= s or hour < e  # qua nửa đêm (Cú Đêm)

    @staticmethod
    def calculate_pulse(chronotype: str = "lark", now: datetime = None) -> Dict[str, Any]:
        # Mặc định tính theo giờ Việt Nam (trước đây dùng giờ máy -> sai múi giờ khi deploy)
        if now is None:
            now = vn_now()

        hour = now.hour + now.minute / 60.0
        ctype = CircadianService._norm_chronotype(chronotype)
        if ctype not in CircadianService.GOLDEN_RANGES:
            ctype = "lark"
        golden = CircadianService.GOLDEN_RANGES[ctype]

        # Đường cong năng lượng nền theo giờ trong ngày
        if 8 <= hour < 11.5:
            pulse = 92
            brainwave = "Sóng não Alpha 10Hz (Tập trung sâu & Tiếp thu nhanh)"
            recommendation = "Khung giờ vàng sáng sớm: Hãy giải quyết các môn đòi hỏi tư duy logic trừu tượng."
        elif 11.5 <= hour < 13.5:
            pulse = 65
            brainwave = "Theta 4-8Hz (Nghỉ ngơi phục hồi)"
            recommendation = "Quãng nghỉ trưa sinh học: Dành 20-30 phút chợp mắt hoặc nghe âm thanh 432Hz."
        elif 14 <= hour < 17:
            pulse = 98
            brainwave = "Sóng não Alpha 10Hz (Khung giờ vàng chiều)"
            recommendation = "Trọng tâm năng lượng: Lý tưởng cho viết đồ án, code mô hình AI hoặc làm bài tập lớn."
        elif 17 <= hour < 19:
            pulse = 72
            brainwave = "Beta nhẹ (Chuyển giao năng lượng)"
            recommendation = "Vận động thể chất nhẹ, ăn tối thực dưỡng và xem lại tiến độ bài học."
        elif 19 <= hour < 22:
            pulse = 88
            brainwave = "Alpha thư thái (Ôn tập & Ghi nhớ dài hạn)"
            recommendation = "Khung giờ vàng tối: Ôn tập flashcard, đọc tài liệu chuyên ngành trước khi ngủ."
        else:
            pulse = 45
            brainwave = "Delta 0.5-4Hz (Chuẩn bị ngủ sâu & Tái tạo tế bào)"
            recommendation = "Đã vào khung giờ ngủ sâu: Hãy tắt màn hình xanh để bảo vệ chu kỳ ngủ REM tối ưu."

        # Điều chỉnh theo tuýp sinh học
        if ctype == "lark":
            if 6 <= hour < 12:
                pulse = min(99, pulse + 6)
            elif hour >= 21 or hour < 5:
                pulse = max(20, pulse - 10)
        elif ctype == "owl":
            if 6 <= hour < 10:
                pulse = max(20, pulse - 12)
            elif 19 <= hour or hour < 1:
                pulse = min(99, pulse + 8)
        # hummingbird / bear: giữ đường cong nền

        is_golden = any(
            CircadianService._in_range(hour, *g.split(" - "))
            for g in golden
        )
        golden_range = " & ".join(golden)

        return {
            "pulse_percent": pulse,
            "status_text": "Cực kỳ cân bằng • Sẵn sàng học sâu" if pulse >= 85 else "Nhịp sinh học ổn định",
            "is_golden_hour": is_golden,
            "current_brainwave_state": brainwave,
            "golden_hour_range": golden_range,
            "recommendation": recommendation
        }

    @staticmethod
    def get_insights(chronotype: str = "lark") -> List[Dict[str, Any]]:
        """
        Gợi ý học thuật theo tuýp sinh học + khung giờ vàng thật từ GOLDEN_RANGES.
        Confidence là nhãn định tính theo độ vững của khuyến nghị (không phải số giả lập).
        """
        ctype = CircadianService._norm_chronotype(chronotype)
        if ctype not in CircadianService.GOLDEN_RANGES:
            ctype = "lark"
        golden = CircadianService.GOLDEN_RANGES[ctype]
        slot_morning, slot_afternoon = golden[0], golden[1]
        bedtime = "23:30" if ctype == "owl" else "23:00"

        return [
            {
                "title": f"Đặt phiên học sâu chính vào khung {slot_afternoon}",
                "detail": f"Theo nhịp sinh học tuýp {ctype}, đây là đỉnh tỉnh thức trong ngày của bạn — ưu tiên môn đòi hỏi tư duy logic trừu tượng.",
                "confidence": "Cao",
                "action_label": "Áp dụng lịch",
                "suggested_time": slot_afternoon.split(" - ")[0],
            },
            {
                "title": "Chèn quãng nghỉ ngắn 15 phút sau mỗi 90 phút tập trung",
                "detail": "Sau 90 phút tập trung cao độ, lượng cortisol tăng nhẹ. 15 phút nghe tiếng sóng 432Hz sẽ tái tạo sự chú ý.",
                "confidence": "Cao",
                "action_label": "Thêm vào lịch",
                "suggested_time": slot_afternoon.split(" - ")[1],
            },
            {
                "title": f"Giới hạn học đêm trước {bedtime}",
                "detail": "Tránh thức quá nửa đêm để giữ chu kỳ giấc ngủ REM 90 phút đầu tiên, giúp não củng cố trí nhớ bài học.",
                "confidence": "Rất cao",
                "action_label": "Đặt nhắc nhở",
                "suggested_time": bedtime,
            },
        ]
