"""Schedule validation + CRUD + auto-balance + lms-sync."""


LMS_TITLES = [
    "Báo cáo Đồ án Thị giác Máy tính (ResNet-50)",
    "Tiểu luận Cuối kỳ: Triết học & Trí tuệ Nhân tạo",
    "Lab 4: Phân mảnh & Nhân bản Dữ liệu Phân tán",
]


def _clean_lms_tasks(client, auth_headers):
    for t in client.get("/api/v1/tasks/", headers=auth_headers).json():
        if t["title"] in LMS_TITLES:
            client.delete(f"/api/v1/tasks/{t['id']}", headers=auth_headers)


def test_normalize_one_digit(client, auth_headers):
    r = client.post(
        "/api/v1/schedule/events",
        json={"title": "Hoc toan", "event_date": "2026-10-01",
              "start_time": "9:00", "end_time": "10:30", "event_type": "self_study"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["start_time"] == "09:00"
    client.delete(f"/api/v1/schedule/events/{r.json()['id']}", headers=auth_headers)


def test_reject_end_before_start(client, auth_headers):
    r = client.post(
        "/api/v1/schedule/events",
        json={"title": "Sai gio", "start_time": "10:00", "end_time": "09:00"},
        headers=auth_headers,
    )
    assert r.status_code == 400, r.text


def test_reject_garbage_time(client, auth_headers):
    r = client.post(
        "/api/v1/schedule/events",
        json={"title": "Gio rac test", "start_time": "abc", "end_time": "10:00"},
        headers=auth_headers,
    )
    assert r.status_code == 400, r.text


def test_patch_partial_range_check(client, auth_headers):
    eid = client.post(
        "/api/v1/schedule/events",
        json={"title": "Patch range", "start_time": "10:00", "end_time": "11:00"},
        headers=auth_headers,
    ).json()["id"]
    r = client.patch(f"/api/v1/schedule/events/{eid}", json={"end_time": "09:00"}, headers=auth_headers)
    assert r.status_code == 400, r.text
    r = client.patch(f"/api/v1/schedule/events/{eid}", json={"start_time": "8:5", "end_time": "12:00"}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["start_time"] == "08:05", r.text
    client.delete(f"/api/v1/schedule/events/{eid}", headers=auth_headers)


def test_toggle_cycle(client, auth_headers):
    eid = client.post(
        "/api/v1/schedule/events",
        json={"title": "Toggle me", "start_time": "10:00", "end_time": "11:00"},
        headers=auth_headers,
    ).json()["id"]
    r1 = client.patch(f"/api/v1/schedule/events/{eid}/toggle", headers=auth_headers)
    r2 = client.patch(f"/api/v1/schedule/events/{eid}/toggle", headers=auth_headers)
    assert r1.json()["is_completed"] is True and r2.json()["is_completed"] is False
    client.delete(f"/api/v1/schedule/events/{eid}", headers=auth_headers)


def test_timeline_filters(client, auth_headers):
    r = client.get("/api/v1/schedule/timeline?date_from=2020-01-01&limit=5", headers=auth_headers)
    assert r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) <= 5


def test_auto_balance_ok(client, auth_headers):
    r = client.post("/api/v1/schedule/auto-balance", json={}, headers=auth_headers)
    assert r.status_code == 200 and "events_count" in r.json(), r.text


def test_lms_sync_demo_idempotent(client, auth_headers):
    _clean_lms_tasks(client, auth_headers)  # Deterministic: không phụ thuộc thứ tự test
    r1 = client.post("/api/v1/schedule/lms-sync",
                     json={"provider": "canvas", "include_timeline": True}, headers=auth_headers)
    assert r1.status_code == 200 and r1.json().get("demo") is True, r1.text
    assert r1.json().get("imported_count") == 3, r1.text
    r2 = client.post("/api/v1/schedule/lms-sync",
                     json={"provider": "canvas", "include_timeline": True}, headers=auth_headers)
    assert r2.json().get("imported_count") == 0, r2.text
    _clean_lms_tasks(client, auth_headers)
