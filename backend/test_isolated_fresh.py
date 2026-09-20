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
    check("1b. User mới chưa verify", client.get("/api/v1/auth/me", headers=uh).json()["is_email_verified"] is False)
    check("1c. User mới tasks trống", client.get("/api/v1/tasks/", headers=uh).json() == [])
    check("1d. User mới timeline trống", client.get("/api/v1/schedule/timeline", headers=uh).json() == [])

    r = client.post("/api/v1/auth/forgot", json={"email": email})
    code = r.json().get("dev_code", "")
    check("1e. Forgot cấp mã 6 số", r.status_code == 200 and len(code) == 6, r.text[:150])
    r = client.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    check("1f. Verify OTP OK (chưa đốt mã)", r.status_code == 200, r.text[:150])
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
    check("3c. Demo không toggle được subtask người khác (403)", r.status_code == 403, r.text[:120])
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

    # ---- Dọn ----
    client.delete(f"/api/v1/tasks/{tid}", headers=uh)
    client.delete(f"/api/v1/schedule/events/{evid}", headers=uh)
    client.delete(f"/api/v1/notes/{nid}", headers=uh)
    client.delete(f"/api/v1/audio/presets/{pid}", headers=uh)

    print(f"\n{'='*60}")
    print(f"KẾT QUẢ DB MỚI: {PASS} PASS / {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
