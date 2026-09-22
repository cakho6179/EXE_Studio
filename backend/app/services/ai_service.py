import json
import os
import re
import httpx
from typing import Dict, Any, List, Optional
from app.core.config import settings

class AIService:
    @staticmethod
    async def _call_gemini(prompt: str, json_mode: bool = False, temperature: float = 0.3) -> Optional[str]:
        """
        Unified Gemini API invoker with gemini-3.5-flash-lite as primary model
        and automatic fallback to available next-gen flash models.
        """
        api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None

        # Prioritize gemini-3.5-flash-lite, then fallbacks
        primary_model = getattr(settings, "GEMINI_MODEL", "gemini-3.5-flash-lite")
        candidate_models = [primary_model, "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash"]
        # Remove duplicates while preserving order
        candidate_models = list(dict.fromkeys(candidate_models))

        gen_config = {"temperature": temperature}
        if json_mode:
            gen_config["response_mime_type"] = "application/json"

        for model in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": gen_config
            }
            try:
                # API key truyền qua header (an toàn hơn nhét vào URL query)
                async with httpx.AsyncClient(timeout=14.0) as client:
                    resp = await client.post(
                        url,
                        json=payload,
                        headers={"x-goog-api-key": api_key},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates and "content" in candidates[0]:
                            parts = candidates[0]["content"].get("parts", [])
                            if parts and "text" in parts[0]:
                                return parts[0]["text"]
                    else:
                        print(f"[AIService] Model {model} status {resp.status_code}: {resp.text[:120]}")
            except Exception as e:
                print(f"[AIService] Model {model} request failed: {e}")
                continue

        return None

    @staticmethod
    async def decompose_task(
        title: str,
        description: Optional[str] = "",
        subject: Optional[str] = "",
        deadline: Optional[str] = "",
        complexity: Optional[str] = "medium"
    ) -> Dict[str, Any]:
        """
        Decomposes an academic assignment into calibrated micro-sprints of 25-minute Pomodoros,
        calibrated with task complexity and circadian energy windows.
        """
        comp_clean = (complexity or "medium").lower()
        if "simple" in comp_clean:
            sprint_target = "1-2 micro-sprints ngắn (tổng 25-50 phút)"
            max_fallback = 2
        elif "complex" in comp_clean:
            sprint_target = "5-8 micro-sprints chi tiết (tổng 125-200 phút)"
            max_fallback = 6
        elif "review" in comp_clean:
            sprint_target = "3-4 micro-sprints ôn tập trọng tâm (tổng 75-100 phút)"
            max_fallback = 4
        else:
            sprint_target = "3-4 micro-sprints vừa sức (tổng 75-100 phút)"
            max_fallback = 4

        prompt = f"""
Bạn là AI Task Deconstructor v3.2 thuộc hệ sinh thái học tập Stuđiô AI (Calm Workspace) dành cho sinh viên đại học Việt Nam.
Nhiệm vụ của bạn: Phân tích sâu bài tập / đồ án sau và chia nhỏ thành {sprint_target} (mỗi sprint 25-35 phút tương ứng các phiên Pomodoro) để sinh viên không bị quá tải, trì hoãn hoặc kiệt sức:

- Tên bài tập: {title}
- Môn học: {subject or 'Chuyên ngành'}
- Chi tiết yêu cầu / Rubric: {description or 'Không có chi tiết thêm'}
- Hạn nộp: {deadline or 'Trong tuần này'}
- Quy mô / Độ phức tạp: {comp_clean} ({sprint_target})

YÊU CẦU: Trả về DUY NHẤT một đối tượng JSON hợp lệ theo đúng cấu trúc sau (không kèm văn bản giải thích hay markdown codeblock):
{{
  "task_title": "{title}",
  "summary_advice": "Lời khuyên ngắn gọn, điềm tĩnh, tạo động lực theo triết lý Calm Tech",
  "circadian_tip": "Gợi ý khung giờ vàng sinh học (Alpha/Peak Energy) phù hợp nhất cho dạng bài tập này",
  "total_estimated_minutes": 100,
  "subtasks": [
    {{
      "title": "Tên bước nhỏ 1",
      "estimated_minutes": 25,
      "pomodoro_count": 1,
      "recommended_circadian_window": "Khung giờ vàng chiều (14:00 - 16:30)",
      "cognitive_load": "high"
    }}
  ]
}}
"""
        # 1. Try Calling Gemini API
        raw_text = await AIService._call_gemini(prompt, json_mode=True, temperature=0.2)
        if raw_text:
            try:
                # Clean up any markdown codeblock wrapping
                cleaned = raw_text.strip()
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                elif cleaned.startswith("```"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                parsed = json.loads(cleaned.strip())

                if isinstance(parsed, dict) and "subtasks" in parsed and len(parsed["subtasks"]) > 0:
                    # Normalize subtask items
                    for st in parsed.get("subtasks", []):
                        if "estimated_minutes" not in st:
                            st["estimated_minutes"] = 25
                        if "pomodoro_count" not in st:
                            st["pomodoro_count"] = max(1, round(st["estimated_minutes"] / 25))
                        if "recommended_circadian_window" not in st:
                            st["recommended_circadian_window"] = "Khung giờ vàng chiều (14:00 - 16:30)"
                        if "cognitive_load" not in st:
                            st["cognitive_load"] = "high"
                    parsed["total_estimated_minutes"] = sum(s.get("estimated_minutes", 25) for s in parsed.get("subtasks", []))
                    parsed["ai_source"] = "gemini"
                    return parsed
            except Exception as parse_err:
                print(f"[AIService] Failed to parse JSON from Gemini: {parse_err}, raw text: {raw_text[:200]}")

        # 2. Intelligent Academic Heuristic Fallback (Ensures 100% Uptime)
        # Gắn ai_source để frontend hiển thị trung thực (key chết -> heuristic).
        title_lower = title.lower()
        if "machine learning" in title_lower or "ai" in title_lower or "ảnh" in title_lower or "mô hình" in title_lower or "deep learning" in title_lower:
            subs = [
                {
                    "title": "Tiền xử lý dữ liệu ảnh mẫu & Data Augmentation",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ sáng (09:00 - 10:30)",
                    "cognitive_load": "medium"
                },
                {
                    "title": "Xây dựng pipeline huấn luyện mô hình & Fine-tuning",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ vàng chiều (14:00 - 15:30)",
                    "cognitive_load": "high"
                },
                {
                    "title": "Trích xuất ma trận nhầm lẫn (Confusion Matrix) & Biểu đồ Loss",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ vàng chiều (15:30 - 16:30)",
                    "cognitive_load": "high"
                },
                {
                    "title": "Viết phần bàn luận kết quả thực nghiệm chuẩn học thuật",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ tối (19:30 - 20:30)",
                    "cognitive_load": "medium"
                },
                {
                    "title": "Soát lỗi trích dẫn tài liệu tham khảo IEEE & Xuất bản PDF",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ tối (20:30 - 21:00)",
                    "cognitive_load": "light"
                }
            ][:max_fallback]
            return {
                "task_title": title,
                "ai_source": "heuristic",
                "summary_advice": "Chia nhỏ bài toán mô hình học máy thành các module độc lập giúp bạn kiểm soát lỗi và không bị áp lực thời hạn.",
                "circadian_tip": "Thực hiện huấn luyện và tinh chỉnh siêu tham số vào khung giờ vàng 14:00 - 16:30 khi não bộ tư duy logic sắc bén nhất.",
                "total_estimated_minutes": sum(s["estimated_minutes"] for s in subs),
                "subtasks": subs
            }
        elif "cơ sở dữ liệu" in title_lower or "database" in title_lower or "sql" in title_lower:
            subs = [
                {
                    "title": "Vẽ lược đồ thực thể quan hệ ERD và chuẩn hóa dạng 3NF",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ sáng (09:30 - 10:30)",
                    "cognitive_load": "high"
                },
                {
                    "title": "Viết DDL tạo bảng, khóa chính, khóa ngoại và ràng buộc toàn vẹn",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ chiều (14:00 - 15:00)",
                    "cognitive_load": "medium"
                },
                {
                    "title": "Soạn tập dữ liệu giả lập (Mock Data) và viết 5 câu truy vấn tối ưu",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ chiều (15:00 - 16:00)",
                    "cognitive_load": "high"
                },
                {
                    "title": "Đo lường thời gian thực thi EXPLAIN ANALYZE và tạo Index",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ tối (19:30 - 20:30)",
                    "cognitive_load": "medium"
                }
            ][:max_fallback]
            return {
                "task_title": title,
                "ai_source": "heuristic",
                "summary_advice": "Tập trung thiết kế ERD chuẩn hóa trước khi bắt tay viết câu lệnh SQL để tránh sửa đổi lược đồ nhiều lần.",
                "circadian_tip": "Viết truy vấn phức tạp và tối ưu hóa index vào đầu giờ sáng hoặc đầu giờ chiều.",
                "total_estimated_minutes": sum(s["estimated_minutes"] for s in subs),
                "subtasks": subs
            }
        else:
            subs = [
                {
                    "title": f"Nghiên cứu tài liệu tham khảo & Thu thập tư liệu cho: {title[:35]}",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ sáng (09:00 - 10:00)",
                    "cognitive_load": "medium"
                },
                {
                    "title": "Xây dựng dàn ý chi tiết và phân công các mục nội dung",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ vàng chiều (14:00 - 15:00)",
                    "cognitive_load": "high"
                },
                {
                    "title": "Viết nội dung cốt lõi và hoàn thiện các luận điểm chính",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ vàng chiều (15:00 - 16:00)",
                    "cognitive_load": "high"
                },
                {
                    "title": "Rà soát định dạng bài nộp, kiểm tra quy chuẩn và nộp bài",
                    "estimated_minutes": 25,
                    "pomodoro_count": 1,
                    "recommended_circadian_window": "Khung giờ tối (19:30 - 20:30)",
                    "cognitive_load": "light"
                }
            ][:max_fallback]
            return {
                "task_title": title,
                "ai_source": "heuristic",
                "summary_advice": "Khởi đầu bằng việc đọc kỹ đề cương và lập khung sườn chi tiết sẽ giúp bạn tiết kiệm 50% thời gian triển khai.",
                "circadian_tip": "Thực hiện bước đọc và nghiên cứu tài liệu vào khung giờ Alpha sáng sớm hoặc đầu giờ tối.",
                "total_estimated_minutes": sum(s["estimated_minutes"] for s in subs),
                "subtasks": subs
            }

    @staticmethod
    async def chat_with_advisor(
        message: str,
        user_context: Optional[Dict[str, Any]] = None,
        document_context: Optional[str] = None,
    ) -> str:
        """
        Interactive Academic Advisor powered by Gemini 3.5 Flash-Lite.
        document_context: text trích từ giáo trình user upload (nếu có) để AI trả lời dựa trên tài liệu thật.
        """
        user_name = user_context.get("full_name", "Minh Châu") if user_context else "Minh Châu"
        major = user_context.get("major", "Công nghệ Thông tin") if user_context else "Công nghệ Thông tin"
        university = user_context.get("university", "ĐHQG TP.HCM") if user_context else "ĐHQG TP.HCM"
        chronotype = user_context.get("chronotype", "bear") if user_context else "bear"
        wake_time = user_context.get("wake_time", "06:30") if user_context else "06:30"
        sleep_time = user_context.get("sleep_time", "23:00") if user_context else "23:00"
        active_tasks = user_context.get("active_tasks", []) if user_context else []
        tasks_text = "\n".join(active_tasks) if active_tasks else "Hiện không có bài tập tồn đọng lớn"

        prompt = f"""
Bạn là "Cố vấn Học thuật AI" của nền tảng Stuđiô AI (Calm Workspace) dành riêng cho sinh viên {user_name} ({university}, chuyên ngành {major}).
Hồ sơ học tập & nhịp sinh học của sinh viên:
- Kiểu nhịp sinh học (Chronotype): {chronotype} (Thức dậy: {wake_time}, Đi ngủ: {sleep_time})
- Các bài tập / đồ án đang thực hiện:
{tasks_text}

Phong cách tư vấn của bạn:
- Điềm đạm, ân cần, mang tính học thuật sâu sắc nhưng dễ tiếp thu (triết lý Calm Tech & Deep Work).
- Giúp sinh viên gỡ rối bài tập, tối ưu hóa phương pháp học, giải tỏa căng thẳng học đường, phòng chống kiệt sức (burnout).
- Đề xuất các hành động thực tế có thể chia thành phiên Pomodoro 25 phút và lựa chọn khung giờ vàng sinh học thích hợp.
- Trả lời bằng tiếng Việt lịch sự, định dạng Markdown rõ ràng, truyền cảm hứng tích cực.

Câu hỏi của sinh viên: "{message}"
{document_context}
Hãy đưa ra câu trả lời chi tiết, thực tế và có cấu trúc:
"""
        reply = await AIService._call_gemini(prompt, json_mode=False, temperature=0.6)
        if reply and len(reply.strip()) > 10:
            return reply.strip()

        # Contextual Fallback
        msg_lower = message.lower()
        if "mô hình" in msg_lower or "cnn" in msg_lower or "machine learning" in msg_lower or "ai" in msg_lower:
            return f"Chào {user_name},\n\nĐối với môn học của bạn tại {university}, khi huấn luyện mô hình máy học, việc gặp ma trận nhầm lẫn (Confusion Matrix) mất cân bằng là rất thường gặp. Thầy khuyên bạn:\n\n1. **Phân tích độ chênh lệch Precision và Recall:** Nếu lớp nào có Recall thấp, hãy xem lại mẫu ảnh huấn luyện của lớp đó có bị thiếu sáng hay góc chụp hẹp không.\n2. **Áp dụng Data Augmentation:** Tăng cường xoay ảnh ngẫu nhiên ±15 độ và điều chỉnh độ sáng nhẹ.\n3. **Khung giờ tối ưu:** Hãy dành 1 phiên Pomodoro 25 phút vào khung giờ vàng 14:00 – 16:30 để tinh chỉnh tham số nhé!"
        elif "csdl" in msg_lower or "sql" in msg_lower or "index" in msg_lower or "database" in msg_lower:
            return f"Chào {user_name},\n\nTrong tối ưu hóa truy vấn SQL, việc đánh Index trên các trường xuất hiện thường xuyên trong mệnh đề `WHERE` và `JOIN` là cực kỳ quan trọng. Tuy nhiên, đừng lạm dụng B-Tree Index cho các bảng có tần suất `INSERT`/`UPDATE` quá cao vì sẽ làm giảm hiệu năng ghi dữ liệu.\n\nBạn có thể chạy lệnh `EXPLAIN ANALYZE` để xem chi tiết chi phí (Cost) của bộ tối ưu hóa truy vấn nhé!"
        else:
            return f"Chào {user_name},\n\nCố vấn AI luôn ở đây đồng hành cùng bạn trên chặng đường học tập tại {university}. Với vấn đề \"{message}\", cách tiếp cận hiệu quả nhất là chia nhỏ vấn đề thành các mục tiêu 25 phút Pomodoro.\n\nHãy giữ tâm trí bình tĩnh, hít một hơi thật sâu và bắt đầu từ bước nhỏ nhất nhé. Bạn muốn chúng ta cùng đào sâu vào khía cạnh nào trước?"
