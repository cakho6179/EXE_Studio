"""Tasks + focus + notifications + moods + notes + study-plans functional."""


def test_ai_decompose_requires_auth(client):
    r = client.post("/api/v1/tasks/ai-decompose", json={"title": "Lam bai"})
    assert r.status_code == 401, r.text


def test_task_subtask_recalc_on_delete(client, auth_headers):
    tid = client.post(
        "/api/v1/tasks/",
        json={"title": "Recalc check", "subtasks": [{"title": "A"}, {"title": "B"}]},
        headers=auth_headers,
    ).json()["id"]
    subs = client.get("/api/v1/tasks/", headers=auth_headers).json()
    task = [t for t in subs if t["id"] == tid][0]
    assert task["total_sprints"] == 2
    sid = task["subtasks"][0]["id"]
    client.delete(f"/api/v1/tasks/subtasks/{sid}", headers=auth_headers)
    task2 = [t for t in client.get("/api/v1/tasks/", headers=auth_headers).json() if t["id"] == tid][0]
    assert task2["total_sprints"] == 1, task2
    client.delete(f"/api/v1/tasks/{tid}", headers=auth_headers)


def test_focus_bogus_task_rejected(client, auth_headers):
    r = client.post(
        "/api/v1/focus/session/complete",
        json={"task_id": "no-such", "planned_minutes": 25, "actual_minutes": 25},
        headers=auth_headers,
    )
    assert r.status_code == 404, r.text


def test_focus_ticks_next_subtask(client, auth_headers):
    tid = client.post(
        "/api/v1/tasks/",
        json={"title": "Focus tick", "subtasks": [{"title": "S1"}, {"title": "S2"}]},
        headers=auth_headers,
    ).json()["id"]
    r = client.post(
        "/api/v1/focus/session/complete",
        json={"task_id": tid, "planned_minutes": 25, "actual_minutes": 25,
              "complete_next_subtask": True},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    task = [t for t in client.get("/api/v1/tasks/", headers=auth_headers).json() if t["id"] == tid][0]
    assert task["completed_sprints"] >= 1, task
    client.delete(f"/api/v1/tasks/{tid}", headers=auth_headers)


def test_notifications_aware_deadline(client, auth_headers):
    r = client.post(
        "/api/v1/tasks/",
        json={"title": "Aware DL", "deadline": "2026-12-01T10:00:00+07:00"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    r = client.get("/api/v1/notifications/list", headers=auth_headers)
    assert r.status_code == 200 and "notifications" in r.json(), r.text
    client.delete(f"/api/v1/tasks/{tid}", headers=auth_headers)


def test_study_plans_validation(client, auth_headers):
    r = client.post("/api/v1/study-plans/", json={"title": "x"}, headers=auth_headers)
    assert r.status_code == 422, r.text
    r = client.post("/api/v1/study-plans/generate",
                    json={"subject": "Toan", "hours_per_day": 99}, headers=auth_headers)
    assert r.status_code == 422, r.text


def test_moods_notes_roundtrip(client, auth_headers):
    r = client.post("/api/v1/moods/", json={"mood": "happy"}, headers=auth_headers)
    assert r.status_code == 400, r.text
    r = client.post("/api/v1/moods/", json={"mood": "calm_focus", "note": "ok"}, headers=auth_headers)
    assert r.status_code == 201, r.text
    nid = client.post("/api/v1/notes/", json={"title": "T", "content": "C"}, headers=auth_headers).json()["id"]
    assert client.delete(f"/api/v1/notes/{nid}", headers=auth_headers).status_code == 200
