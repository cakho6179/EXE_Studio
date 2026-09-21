"""Pytest suite tren DB co lap (tmpdir), khong dung DB dev.
Chay: python -m pytest tests/ -q (tu thu muc backend/)
"""
import os
import sys
import tempfile

TMPDIR = tempfile.mkdtemp(prefix="studi_pytest_")
os.chdir(TMPDIR)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def auth_headers(client):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "chau.nguyen@vnuhcm.edu.vn", "password": "password123"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
