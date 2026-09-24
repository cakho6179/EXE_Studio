"""
Suite kiểm thử trên DATABASE MỚI TINH (cô lập hoàn toàn khỏi studi_ai.db dev).
- Tạo thư mục tạm, chdir vào đó TRƯỚC khi import app để SQLite dựng file mới.
- Seed demo tự chạy, sau đó kiểm thử toàn luồng như user thật từ con số 0.
Chạy: python test_isolated_fresh.py
"""
import os
import sys
import tempfile

TMPDIR = tempfile.mkdtemp(prefix="studi_test_")
os.chdir(TMPDIR)
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402 (seed demo tự chạy trên DB mới)

client = TestClient(app)
PASS = 0
FAIL = 0


def check(name, condition, extra=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"[PASS] {name}")
    else:
        FAIL += 1
        print(f"[FAIL] {name} {extra}")


def main():
    print(f"=== TEST TREN DB MOI TINH: {TMPDIR}/studi_ai.db ===\n")

    # ---- 0. Seed demo có mặt trên DB trống ----
    r = client.post("/api/v1/auth/login",
                    json={"email": "chau.nguyen@vnuhcm.edu.vn", "password": "password123"})
    check("0a. Seed demo login được trên DB mới", r.status_code == 200, r.text[:120])
    demo_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    check("0b. Seed có 3 tasks demo", len(client.get("/api/v1/tasks/", headers=demo_h).json()) == 3)
    check("0c. Seed có 5 sự kiện lịch", len(client.get("/api/v1/schedule/timeline", headers=demo_h).json()) == 5)

    # ---- 1. Register -> OTP -> verify -> reset -> login (user mới trắng) ----
    email = "fresh.user@vnuhcm.edu.vn"
    r = client.post("/api/v1/auth/register", json={
        "email": email, "password": "matkhau123", "full_name": "Fresh User"})
    check("1a. Register 200 + có refresh_token", r.status_code == 200 and bool(r.json().get("refresh_token")), r.text[:150])
    uh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    check("1b. User mới chưa verify và chưa onboard", client.get("/api/v1/auth/me", headers=uh).json()["is_email_verified"] is False and client.get("/api/v1/auth/me", headers=uh).json().get("is_onboarded") is False)
    check("1c. User mới tasks trống", client.get("/api/v1/tasks/", headers=uh).json() == [])
    check("1d. User mới timeline trống", client.get("/api/v1/schedule/timeline", headers=uh).json() == [])

    r = client.post("/api/v1/auth/forgot", json={"email": email})
    code = r.json().get("dev_code", "")
    check("1e. Forgot cấp mã 6 số", r.status_code == 200 and len(code) == 6, r.text[:150])
    r = client.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    check("1f. Verify OTP OK + cấp token", r.status_code == 200 and "access_token" in r.json() and r.json()["user"].get("is_onboarded") is False, r.text[:150])
    r = client.post("/api/v1/auth/reset-password",
                    json={"email": email, "code": code, "new_password": "moikhoe123"})
    check("1g. Reset password bằng cùng mã OK", r.status_code == 200, r.text[:150])
    r = client.post("/api/v1/auth/reset-password",
                    json={"email": email, "code": code, "new_password": "khac12345"})
    check("1h. Mã đã dùng bị từ chối", r.status_code == 400)
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "moikhoe123"})
    check("1i. Login bằng MK mới OK", r.status_code == 200)
    uh = {"Authorization": f"Bearer {r.json()['access_token']}"}

    # ---- 2. Onboarding profile ----
    r = client.put("/api/v1/auth/profile", json={
        "major": "Khoa học Máy tính", "target_daily_focus_hours": 4.5,
        "target_gpa": 3.6, "chronotype": "owl"}, headers=uh)
    check("2a. PUT profile onboarding", r.status_code == 200 and r.json()["profile"]["chronotype"] == "owl", r.text[:150])
    r = client.get("/api/v1/circadian/pulse", headers=uh)
    check("2b. Pulse theo chronotype owl", r.status_code == 200 and "20:30" in r.json()["golden_hour_range"], r.text[:150])

    # ---- 3. Tasks + subtasks + ownership ----
    r = client.post("/api/v1/tasks/", json={
        "title": "Task của Fresh", "priority": "high",
        "subtasks": [{"title": "Bước 1"}, {"title": "Bước 2"}]}, headers=uh)
    check("3a. Tạo task (201)", r.status_code == 201, r.text[:150])
    tid = r.json()["id"]
    sid = r.json()["subtasks"][0]["id"]
    r = client.patch(f"/api/v1/tasks/subtasks/{sid}/toggle", headers=uh)
    check("3b. Toggle subtask của mình", r.status_code == 200 and r.json()["is_completed"] is True)
    # user khác không được đụng
    r = client.patch(f"/api/v1/tasks/subtasks/{sid}/toggle", headers=demo_h)
    # Contract đúng: 404 (không 403) — không lộ sự tồn tại của subtask người khác
    check("3c. Demo không toggle được subtask người khác (404)", r.status_code == 404, r.text[:120])
    r = client.get(f"/api/v1/tasks/{tid}", headers=demo_h)
    check("3d. Demo không đọc task người khác (404)", r.status_code == 404)
    r = client.delete(f"/api/v1/tasks/{tid}", headers=demo_h)
    check("3e. Demo không xóa task người khác (404)", r.status_code == 404)

    # ---- 4. Focus + schedule + moods + notes + docs + presets ----
    r = client.post("/api/v1/focus/session/complete", json={
        "task_id": tid, "planned_minutes": 25, "actual_minutes": 25}, headers=uh)
    check("4a. Focus session (201)", r.status_code == 201, r.text[:150])
    r = client.post("/api/v1/schedule/events", json={
        "title": "Học sâu Fresh", "start_time": "14:00", "end_time": "15:30"}, headers=uh)
    check("4b. Tạo event + event_date tự gán", r.status_code == 201 and bool(r.json().get("event_date")), r.text[:150])
    evid = r.json()["id"]
    r = client.post("/api/v1/moods/", json={"mood": "alpha_flow"}, headers=uh)
    check("4c. Mood (200/201)", r.status_code in (200, 201), r.text[:120])
    r = client.post("/api/v1/notes/", json={"title": "Note Fresh"}, headers=uh)
    check("4d. Note (200/201)", r.status_code in (200, 201), r.text[:120])
    nid = r.json().get("id")
    r = client.post("/api/v1/advisor/upload",
                    files={"file": ("fresh.txt", "hello fresh db".encode(), "text/plain")}, headers=uh)
    check("4e. Upload doc", r.status_code == 200, r.text[:150])
    doc_id = r.json().get("id")
    check("4f. Documents list có file", any(
        d["filename"] == "fresh.txt"
        for d in client.get("/api/v1/advisor/documents", headers=uh).json()["documents"]))
    r = client.post("/api/v1/audio/presets", json={"name": "Fresh preset"}, headers=uh)
    check("4g. Audio preset", r.status_code == 200, r.text[:150])
    pid = r.json()["id"]

    # ---- 5. Advisor sessions + notifications + analytics ----
    r = client.post("/api/v1/advisor/new-session", headers=uh)
    check("5a. New advisor session", r.status_code == 200, r.text[:150])
    sid2 = r.json()["id"]
    r = client.post(f"/api/v1/advisor/chat?session_id={sid2}", json={"content": "Pomodoro là gì?"}, headers=uh)
    check("5b. Chat có reply + đúng session", r.status_code == 200 and r.json().get("session_id") == sid2, r.text[:150])
    r = client.get("/api/v1/notifications/list", headers=uh)
    check("5c. Notifications từ data thật", r.status_code == 200 and r.json()["unread_count"] >= 1, r.text[:150])
    for rng in ("week", "month", "semester"):
        d = client.get(f"/api/v1/analytics/dashboard?range={rng}", headers=uh).json()
        check(f"5d. Analytics range={rng} 7 điểm", len(d["weekly_focus_hours"]) == 7 and len(d["week_days"]) == 7)
    check("5e. Badges 5 luật", len(d.get("badges", [])) == 5)

    # ---- 6. Bảo mật: 401/422/serve đúng ----
    r = client.get("/api/v1/auth/me")
    check("6a. Không token -> 401", r.status_code == 401)
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage-token-xyz"})
    check("6b. Token rác -> 401", r.status_code == 401)
    # refresh token không gọi được API
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "moikhoe123"})
    rt = r.json()["refresh_token"]
    check("6c. Refresh token bị chặn gọi API (401)",
          client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {rt}"}).status_code == 401)
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    check("6d. Đổi refresh lấy cặp mới", r.status_code == 200 and bool(r.json().get("access_token")))
    # verify OTP sai
    r = client.post("/api/v1/auth/verify-otp", json={"email": email, "code": "000000"})
    check("6e. OTP sai -> 400", r.status_code == 400)

    # ---- 7. Tính năng mới: Certificate, Task Deduplicate, Multi-provider LMS Sync ----
    r = client.get("/api/v1/analytics/certificate", headers=uh)
    cert = r.json()
    check("7a. Cấp chứng nhận Deep Work số hóa",
          r.status_code == 200 and cert.get("status") == "verified" and cert.get("certificate_id", "").startswith("STU-CERT-2026-"),
          r.text[:120])
    check("7b. Chứng nhận có băm xác thực SHA-256",
          bool(cert.get("verification_hash")) and bool(cert.get("verification_url")),
          cert.get("verification_hash", ""))

    # Deduplicate task
    client.post("/api/v1/tasks/", json={"title": "Task Trùng Lặp Kiểm Thử", "priority": "medium", "complexity": "simple", "total_sprints": 2}, headers=uh)
    client.post("/api/v1/tasks/", json={"title": "Task Trùng Lặp Kiểm Thử", "priority": "medium", "complexity": "simple", "total_sprints": 2}, headers=uh)
    r = client.post("/api/v1/tasks/deduplicate", headers=uh)
    check("7c. Gộp task trùng (POST /tasks/deduplicate)",
          r.status_code == 200 and r.json().get("removed_count", 0) >= 1,
          r.text[:120])

    # Multi-provider LMS Sync (Teams)
    r = client.post("/api/v1/schedule/lms-sync", json={"provider": "teams", "include_timeline": True}, headers=uh)
    check("7d. Đồng bộ LMS đa nền tảng (Microsoft Teams)",
          r.status_code == 200 and r.json().get("provider") == "teams" and "Teams" in r.json().get("message", ""),
          r.text[:120])

    # Flexible Task Creation (không bị 422 khi date format UI, tiếng Việt priority, hay custom complexity)
    flex_task = {
        "title": "Hoàn thành bài tập về nhà",
        "description": "Bài tập lớn môn AI",
        "subject_name": "Trí tuệ nhân tạo (CS301)",
        "subject_code": "CS301",
        "deadline": "10/01/2026 07:18 PM",
        "priority": "Ưu tiên cao",
        "complexity": "Đồ án lớn / Bài báo (5 - 8 Sprints • ~200p)",
        "subtasks": [
            {"title": "Bước 1: Nghiên cứu đề bài", "estimated_minutes": "30 phút", "pomodoro_count": "1"}
        ]
    }
    r = client.post("/api/v1/tasks/", json=flex_task, headers=uh)
    check("7e. Tạo task linh hoạt (deadline 10/01/2026 07:18 PM, priority VN, complexity custom)",
          r.status_code == 201 and r.json().get("priority") == "high" and r.json().get("complexity") == "complex",
          r.text[:120])

    # Logout server
    r = client.post("/api/v1/auth/logout", headers=uh)
    check("7f. Đăng xuất an toàn server (POST /auth/logout)",
          r.status_code == 200 and r.json().get("status") == "success",
          r.text[:120])

    # Complete onboarding marks is_onboarded=True
    r = client.post("/api/v1/onboarding/complete", json={"answers": {"major": "Khoa học Máy tính", "chronotype": "owl", "focus_duration": "medium"}}, headers=uh)
    check("7g. Hoàn tất onboarding đánh dấu is_onboarded=True (POST /onboarding/complete)",
          r.status_code == 200 and client.get("/api/v1/auth/me", headers=uh).json().get("is_onboarded") is True,
          r.text[:120])

    # 7h. Xóa tài liệu khỏi bộ nhớ AI (DELETE /advisor/documents/{doc_id})
    if 'doc_id' in locals():
        r = client.delete(f"/api/v1/advisor/documents/{doc_id}", headers=uh)
        check("7h. Xóa tài liệu khỏi bộ nhớ AI (DELETE /advisor/documents/{id})",
              r.status_code == 200 and r.json().get("status") == "success",
              r.text[:120])

    # 7i. Tạo và áp dụng kế hoạch học tập AI vào lịch (POST /study-plans/{id}/apply-to-schedule)
    r = client.post("/api/v1/study-plans/generate", json={"subject": "Hệ điều hành", "hours_per_day": 2, "level": "medium"}, headers=uh)
    plan_id = r.json().get("plan", {}).get("id")
    r_apply = client.post(f"/api/v1/study-plans/{plan_id}/apply-to-schedule", headers=uh)
    check("7i. Áp dụng chặng kế hoạch học tập AI vào thời khóa biểu (POST /study-plans/{id}/apply-to-schedule)",
          r_apply.status_code == 200 and r_apply.json().get("added_count", 0) > 0,
          r_apply.text[:120])
    client.delete(f"/api/v1/study-plans/{plan_id}", headers=uh)

    # 7j. Đánh dấu hoàn thành task không có subtask (PATCH /tasks/{id})
    r_task_nosub = client.post("/api/v1/tasks/", json={"title": "Đọc tài liệu ôn tập", "subject_name": "Triết học", "subtasks": []}, headers=uh)
    t_nosub_id = r_task_nosub.json().get("id")
    r_patch = client.patch(f"/api/v1/tasks/{t_nosub_id}", json={"status": "completed"}, headers=uh)
    check("7j. Đánh dấu hoàn thành task không có subtask được giữ nguyên status=completed",
          r_patch.status_code == 200 and r_patch.json().get("status") == "completed",
          r_patch.text[:120])
    client.delete(f"/api/v1/tasks/{t_nosub_id}", headers=uh)

    # 7k. Tự động cân bằng lịch sinh học AI (POST /schedule/auto-balance)
    r_bal = client.post("/api/v1/schedule/auto-balance", json={}, headers=uh)
    check("7k. Thuật toán cân bằng lịch sinh học AI (POST /schedule/auto-balance)",
          r_bal.status_code == 200 and r_bal.json().get("status") == "success",
          r_bal.text[:120])

    # 7l. Cân bằng lại khi đã tối ưu trả thông báo hoàn hảo
    r_bal2 = client.post("/api/v1/schedule/auto-balance", json={}, headers=uh)
    check("7l. Cân bằng lại khi đã tối ưu trả thông điệp hoàn hảo (balanced_count=0)",
          r_bal2.status_code == 200 and r_bal2.json().get("balanced_count") == 0 and "tối ưu hoàn hảo" in r_bal2.json().get("message", ""),
          r_bal2.text[:120])

    # 7m. Sửa nhanh ghi chú inline (PATCH /api/v1/notes/{id})
    r_note_edit = client.patch(f"/api/v1/notes/{nid}", json={"title": "Note Fresh Updated", "content": "Nội dung cập nhật"}, headers=uh)
    check("7m. Sửa nhanh ghi chú inline (PATCH /api/v1/notes/{id})",
          r_note_edit.status_code == 200 and r_note_edit.json().get("title") == "Note Fresh Updated",
          r_note_edit.text[:120])

    # 7n. Báo cáo phân tích AI Insights (GET /api/v1/analytics/ai-insights)
    r_insights = client.get("/api/v1/analytics/ai-insights?days=7", headers=uh)
    check("7n. Báo cáo phân tích AI Insights (GET /api/v1/analytics/ai-insights)",
          r_insights.status_code == 200 and r_insights.json().get("status") == "success" and len(r_insights.json().get("insights", [])) >= 1,
          r_insights.text[:120])

    # 7o. Ma trận tương quan phân bổ thời gian (GET /api/v1/analytics/correlations)
    r_corr = client.get("/api/v1/analytics/correlations?days=7", headers=uh)
    check("7o. Ma trận tương quan phân bổ thời gian (GET /api/v1/analytics/correlations)",
          r_corr.status_code == 200 and r_corr.json().get("status") == "success" and isinstance(r_corr.json().get("hour_distribution"), dict),
          r_corr.text[:120])

    # 7p. An toàn khóa ngoại khi xóa task (DELETE /api/v1/tasks/{id} unlinking FK)
    r_task_fk = client.post("/api/v1/tasks/", json={"title": "Task Khóa Ngoại", "priority": "high"}, headers=uh)
    t_fk_id = r_task_fk.json()["id"]
    r_ev_fk = client.post("/api/v1/schedule/events", json={"title": "Event Khóa Ngoại", "task_id": t_fk_id, "start_time": "16:00", "end_time": "17:00"}, headers=uh)
    ev_fk_id = r_ev_fk.json()["id"]
    r_del_task = client.delete(f"/api/v1/tasks/{t_fk_id}", headers=uh)
    check("7p. An toàn khóa ngoại khi xóa task (DELETE /api/v1/tasks/{id} gỡ FK an toàn)",
          r_del_task.status_code == 200 and client.get(f"/api/v1/schedule/events/{ev_fk_id}", headers=uh).json().get("task_id") is None,
          r_del_task.text[:120])
    client.delete(f"/api/v1/schedule/events/{ev_fk_id}", headers=uh)

    # 7q. Hoàn thành task mẹ tự động hoàn thành các micro-subtasks (PATCH /api/v1/tasks/{id})
    r_task_with_subs = client.post("/api/v1/tasks/", json={
        "title": "Đồ án Kiến trúc Máy tính",
        "priority": "high",
        "subtasks": [{"title": "Bước 1: Thiết kế ALU"}, {"title": "Bước 2: Viết testbench"}]
    }, headers=uh)
    t_subs_id = r_task_with_subs.json()["id"]
    # Mark task completed
    r_comp = client.patch(f"/api/v1/tasks/{t_subs_id}", json={"status": "completed"}, headers=uh)
    comp_json = r_comp.json()
    all_subs_done = all(s.get("is_completed") is True for s in comp_json.get("subtasks", []))
    check("7q. Hoàn thành task mẹ tự động hoàn thành các micro-subtasks",
          r_comp.status_code == 200 and comp_json.get("status") == "completed" and all_subs_done and comp_json.get("completed_sprints") == 2,
          f"status={comp_json.get('status')}, subs={comp_json.get('subtasks')}")
    # Reopen task in_progress
    r_reopen = client.patch(f"/api/v1/tasks/{t_subs_id}", json={"status": "in_progress"}, headers=uh)
    reopen_json = r_reopen.json()
    all_subs_open = all(s.get("is_completed") is False for s in reopen_json.get("subtasks", []))
    check("7r. Mở lại task mẹ chuyển subtasks về in_progress",
          r_reopen.status_code == 200 and reopen_json.get("status") == "in_progress" and all_subs_open,
          f"status={reopen_json.get('status')}")
    # 7s. Notifications chứa link điều hướng tương tác
    r_notif = client.get("/api/v1/notifications/list", headers=uh)
    notifs = r_notif.json().get("notifications", [])
    has_links = len(notifs) > 0 and any("link" in n and n["link"].startswith("/") for n in notifs)
    check("7s. Thông báo kèm đường dẫn link tương tác", r_notif.status_code == 200 and has_links, f"notifs={notifs[:2]}")

    # 7t. AI Deconstruct tôn trọng tham số complexity
    r_decomp = client.post("/api/v1/tasks/ai-decompose", json={"title": "Lab 1 SQL Query Optimization", "complexity": "simple"}, headers=uh)
    decomp_json = r_decomp.json() if r_decomp.status_code == 200 else {}
    subs = decomp_json.get("subtasks", [])
    check("7t. AI Deconstruct tôn trọng complexity simple (1-2 sprints)",
          r_decomp.status_code == 200 and 1 <= len(subs) <= 2 and decomp_json.get("total_estimated_minutes") > 0,
          f"status={r_decomp.status_code}, subs_count={len(subs)}")

    # 7u. Đổi mật khẩu tài khoản
    r_wrong_pwd = client.post("/api/v1/auth/change-password", json={"current_password": "saimatkhau", "new_password": "newpass123"}, headers=uh)
    r_short_pwd = client.post("/api/v1/auth/change-password", json={"current_password": "moikhoe123", "new_password": "123"}, headers=uh)
    r_ok_pwd = client.post("/api/v1/auth/change-password", json={"current_password": "moikhoe123", "new_password": "newpass456"}, headers=uh)
    r_relogin_old = client.post("/api/v1/auth/login", json={"email": email, "password": "moikhoe123"})
    r_relogin_new = client.post("/api/v1/auth/login", json={"email": email, "password": "newpass456"})
    check("7u. Đổi mật khẩu tài khoản an toàn (POST /auth/change-password)",
          r_wrong_pwd.status_code == 400 and r_short_pwd.status_code == 400 and r_ok_pwd.status_code == 200 and r_relogin_old.status_code == 400 and r_relogin_new.status_code == 200,
          f"wrong={r_wrong_pwd.status_code}, ok={r_ok_pwd.status_code}, relogin_new={r_relogin_new.status_code}")

    # 7v. Đổi tên phiên cố vấn có xác thực độ dài & Phân tích nhịp sinh học theo chronotype
    r_sess = client.post("/api/v1/advisor/new-session", headers=uh)
    new_sid = r_sess.json().get("id")
    r_rename_short = client.patch(f"/api/v1/advisor/sessions/{new_sid}", json={"title": "a"}, headers=uh)
    r_rename_ok = client.patch(f"/api/v1/advisor/sessions/{new_sid}", json={"title": "Nghiên cứu Deep Learning"}, headers=uh)
    r_dash = client.get("/api/v1/analytics/dashboard?range=week", headers=uh)
    dash_data = r_dash.json() if r_dash.status_code == 200 else {}
    check("7v. Xác thực đổi tên phiên cố vấn (min 2 ký tự) & Điểm sinh học Chronotype",
          r_rename_short.status_code == 400 and r_rename_ok.status_code == 200
          and r_dash.status_code == 200 and 0 <= dash_data.get("circadian_alignment_score", -1) <= 100
          and 0 <= dash_data.get("zen_efficiency_index", -1) <= 100,
          f"rename_short={r_rename_short.status_code}, score={dash_data.get('circadian_alignment_score')}")

    # 7w. Tích hợp 3rd-Party OTP Provider & Gửi lại mã (POST /auth/resend-otp)
    r_otp_bad_mail = client.post("/api/v1/auth/resend-otp", json={"email": "invalid-email"})
    r_otp_resend = client.post("/api/v1/auth/resend-otp", json={"email": email})
    otp_data = r_otp_resend.json() if r_otp_resend.status_code == 200 else {}
    dev_otp = otp_data.get("dev_code")
    r_otp_verify = client.post("/api/v1/auth/verify-otp", json={"email": email, "code": dev_otp}) if dev_otp else None
    check("7w. Tích hợp 3rd-Party OTP Provider & Gửi lại mã (POST /auth/resend-otp)",
          r_otp_bad_mail.status_code == 400 and r_otp_resend.status_code == 200
          and otp_data.get("status") == "success" and "provider" in otp_data
          and (r_otp_verify is not None and r_otp_verify.status_code == 200),
          f"bad={r_otp_bad_mail.status_code}, resend={r_otp_resend.status_code}, prov={otp_data.get('provider')}")

    client.delete(f"/api/v1/tasks/{tid}", headers=uh)
    client.delete(f"/api/v1/schedule/events/{evid}", headers=uh)
    client.delete(f"/api/v1/notes/{nid}", headers=uh)
    client.delete(f"/api/v1/audio/presets/{pid}", headers=uh)
    client.delete(f"/api/v1/advisor/sessions/{new_sid}", headers=uh)

    print(f"\n{'='*60}")
    print(f"KẾT QUẢ DB MỚI: {PASS} PASS / {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
