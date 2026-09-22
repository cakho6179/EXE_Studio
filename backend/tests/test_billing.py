"""Billing: plans, status, checkout, cancel."""


def test_plans_public_shape(client):
    # can auth de lay plans? endpoint public thi khong can token; neu 401 thi bo qua
    r = client.get("/api/v1/billing/plans")
    assert r.status_code == 200 and "pro" in r.json()["plans"], r.text
    assert r.json()["plans"]["pro"]["monthly"] == 39000


def test_status_default_free(client, auth_headers):
    r = client.get("/api/v1/billing/status", headers=auth_headers)
    assert r.status_code == 200 and r.json()["plan"] == "free", r.text


def test_checkout_invalid(client, auth_headers):
    r = client.post("/api/v1/billing/checkout", json={"plan": "free"}, headers=auth_headers)
    assert r.status_code == 400, r.text
    r = client.post("/api/v1/billing/checkout",
                    json={"plan": "pro", "cycle": "weekly"}, headers=auth_headers)
    assert r.status_code == 400, r.text
    r = client.post("/api/v1/billing/checkout",
                    json={"plan": "pro", "cycle": "monthly", "provider": "cash"}, headers=auth_headers)
    assert r.status_code == 400, r.text


def test_checkout_cancel_cycle(client, auth_headers):
    r = client.post("/api/v1/billing/checkout",
                    json={"plan": "pro", "cycle": "monthly", "provider": "momo"},
                    headers=auth_headers)
    assert r.status_code == 201 and r.json()["subscription"]["amount"] == 39000, r.text
    r = client.get("/api/v1/billing/status", headers=auth_headers)
    assert r.json()["plan"] == "pro", r.text
    # checkout lan 2 -> goi cu bi huy, chi 1 goi active
    r = client.post("/api/v1/billing/checkout",
                    json={"plan": "pro", "cycle": "yearly", "provider": "card"},
                    headers=auth_headers)
    assert r.status_code == 201 and r.json()["subscription"]["amount"] == 390000, r.text
    r = client.post("/api/v1/billing/cancel", headers=auth_headers)
    assert r.status_code == 200, r.text
    r = client.get("/api/v1/billing/status", headers=auth_headers)
    assert r.json()["plan"] == "free", r.text
    r = client.post("/api/v1/billing/cancel", headers=auth_headers)
    assert r.status_code == 404, r.text


def test_billing_requires_auth(client):
    assert client.get("/api/v1/billing/status").status_code == 401
    assert client.post("/api/v1/billing/checkout", json={"plan": "pro"}).status_code == 401


def test_ai_quota_free_limited(client, auth_headers):
    q = client.get("/api/v1/billing/quota", headers=auth_headers).json()
    assert q["plan"] == "free" and q["limit"] == 3, q
    for _ in range(q["remaining"]):
        r = client.post("/api/v1/tasks/ai-decompose", json={"title": "Bai kiem quota"}, headers=auth_headers)
        assert r.status_code == 200, r.text
    r = client.post("/api/v1/tasks/ai-decompose", json={"title": "Vuot quota"}, headers=auth_headers)
    assert r.status_code == 403 and "Pro" in r.json().get("detail", ""), r.text
    q = client.get("/api/v1/billing/quota", headers=auth_headers).json()
    assert q["used"] == 3 and q["remaining"] == 0, q


def test_ai_quota_pro_unlimited(client, auth_headers):
    client.post("/api/v1/billing/checkout",
                json={"plan": "pro", "cycle": "monthly", "provider": "demo"}, headers=auth_headers)
    for _ in range(4):
        r = client.post("/api/v1/tasks/ai-decompose", json={"title": "Pro decompose"}, headers=auth_headers)
        assert r.status_code == 200, r.text
    q = client.get("/api/v1/billing/quota", headers=auth_headers).json()
    assert q["plan"] == "pro" and q["limit"] == -1, q
    client.post("/api/v1/billing/cancel", headers=auth_headers)
