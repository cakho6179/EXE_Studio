# Stuđiô AI — FEATURE AUDIT theo từng màn (tính năng nào → API nào → chạy hay fail)

Ngày: 2026-09-21. Mỗi màn: bảng tính năng × trạng thái test thật.
Ký hiệu: ✅ chạy (có proof) / ❌ fail / ⚠️ chạy nhưng sai mục đích / ⏳ chưa test.

## Pro vs Miễn Phí khác nhau ở đâu?

| Khả năng | Miễn Phí | Pro 39.000đ/tháng |
|---|---|---|
| AI phân rã đồ án | 3 lượt/tháng (hết → gợi nâng cấp, 403) | Không giới hạn |
| Thư viện âm thanh | Sóng biển + Mưa nhẹ (+ Im lặng) | Full 15 track |
| Lịch/Kế hoạch/Tasks/Focus/Advisor | Đầy đủ | Đầy đủ |
| Badge | — | PRO ở header + Hồ sơ |
| Hủy gói | — | Giữ quyền lợi đến hết chu kỳ |

Enforce thật ở backend (`AiUsage` theo tháng, `billing/quota`), UI hiện quota + khóa 🔒.
Cổng thanh toán thật (MoMo/thẻ) nối sau — hiện demo kích hoạt ngay, ghi rõ trên màn hình.

## Màn Tasks (`#/tasks`) — đã audit full

| # | Tính năng | API | Trạng thái | Ghi chú |
|---|-----------|-----|------------|---------|
| T1 | AI phân rã (box "Bẻ nhỏ nhiệm vụ") | POST /tasks/ai-decompose {title} | ✅ | Key mới LIVE (test 3.5s, `ai_source: gemini`, 5 subtasks thật). Key cũ bị Google thu hồi vì commit plaintext — bài học: không commit key. |
| T2 | Badge nguồn AI | (field `ai_source`) | ✅ | Mới thêm: "✨ AI Gemini" vs "📌 Gợi Ý mẫu". Test: `ai_source: heuristic` về đúng. |
| T3 | Lưu thành 1 nhiệm vụ (+ auto-schedule 4 events) | POST /tasks/ + POST /schedule/events ×4 | ✅ | Test 201 trực tiếp. Lưu ý: deadline null OK. |
| T4 | Tách thành N task nhỏ (mới) | POST /tasks/ ×N | ✅ | Mới thêm theo yêu cầu "lưu thành các task nhỏ". Build pass. |
| T5 | Modal tạo/sửa + AI preview trong modal | POST/PATCH /tasks/ | ⏳ | Code đầy đủ field; chưa test E2E click. |
| T6 | Tick/xóa micro-sprint, xóa task | PATCH/DELETE subtask, DELETE task | ✅ | Suite 45/45 + e2e. |
| T7 | Ghi chú nhanh | GET/POST/DELETE /notes/ | ✅ | E2E round-2 pass. |
| T8 | Gộp task trùng | DELETE /tasks/ ×N (client) + POST /tasks/deduplicate (server) | ✅ | Cả 2 đường tồn tại; nút client có confirm. |
| T9 | Lọc/tìm/sắp xếp, stats, advice card | GET /tasks/ + /circadian/pulse | ✅ | Client-side, build pass. |

## Màn Dashboard (`#/dashboard`) — khung (chi tiết sau)

| # | Tính năng | API | Trạng thái | Ghi chú |
|---|-----------|-----|------------|---------|
| D1 | Tick micro-sprint từ checkbox | PATCH /tasks/subtasks/{id}/toggle | ✅ | Vừa fix: bỏ GET thừa, task 0-subtask đảo status, có loading. |
| D2 | Timeline hôm nay tick/xóa | PATCH/DELETE /schedule/events | ✅ | E2E pass. |
| D3 | AI insights + apply | GET /circadian/insights, POST /schedule/events|auto-balance | ⏳ | Chưa test E2E click. |
| D4 | Mood check-in | POST/GET /moods/ | ✅ | E2E pass (invalid → 400). |

## Các màn còn lại — TODO audit chi tiết

- Planner, Schedule, DeepWork, Advisor, Sound, Analytics, Profile, Onboarding, Auth (login/register/forgot/verify), Landing.
- Mỗi màn sẽ có bảng như trên sau khi test API逐 tính năng.
