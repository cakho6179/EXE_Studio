"""Onboarding mapping (wizard React -> profile)."""


def test_full_wizard_answers(client, auth_headers):
    answers = {
        "majors": ["CNTT"], "major": "CNTT", "daily_goal": "4.5h",
        "focus_hours": 4.5, "target_hours": 5, "circadian_slot": "night",
        "chronotype": "owl", "intensity": "deep",
    }
    r = client.post("/api/v1/onboarding/complete", json={"answers": answers}, headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["chronotype"] == "owl"
    p = client.get("/api/v1/auth/profile", headers=auth_headers).json()
    # Slider tay (target_hours) thang focus_hours mac dinh theo goal
    assert p["target_daily_focus_hours"] == 5.0
    assert p["preferred_study_style"] == "deep_work"
    assert p["peak_start_time"] == "20:00" and p["peak_end_time"] == "22:30"


def test_enum_style_answers(client, auth_headers):
    r = client.post(
        "/api/v1/onboarding/complete",
        json={"answers": {"chronotype": "hummingbird", "focus_duration": "long"}},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["chronotype"] == "intermediate"
    p = client.get("/api/v1/auth/profile", headers=auth_headers).json()
    assert p["target_daily_focus_hours"] == 7.0


def test_empty_answers_ok(client, auth_headers):
    r = client.post("/api/v1/onboarding/complete", json={"answers": {}}, headers=auth_headers)
    assert r.status_code == 200, r.text


def test_no_auth_rejected(client):
    r = client.post("/api/v1/onboarding/complete", json={"answers": {"chronotype": "owl"}})
    assert r.status_code == 401, r.text
