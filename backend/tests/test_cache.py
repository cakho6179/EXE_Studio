"""Unit test cho app/core/cache.py (khong can DB)."""
from app.core import cache


def test_response_cache_hit_and_ttl():
    calls = []

    @cache.cached_response(ttl=60)
    def fake(db=None, current_user=None, q="a"):
        calls.append(1)
        return {"n": len(calls)}

    class U:
        id = "u1"

    r1 = fake(db=None, current_user=U(), q="a")
    r2 = fake(db=None, current_user=U(), q="a")
    assert r1 == r2 == {"n": 1}
    # Param khac -> key khac
    r3 = fake(db=None, current_user=U(), q="b")
    assert r3 == {"n": 2}
    # User khac -> key khac
    class U2:
        id = "u2"

    r4 = fake(db=None, current_user=U2(), q="a")
    assert r4 == {"n": 3}


def test_bump_invalidates():
    calls = []

    @cache.cached_response(ttl=60)
    def fake(db=None, current_user=None):
        calls.append(1)
        return {"n": len(calls)}

    class U:
        id = "ubump"

    assert fake(db=None, current_user=U()) == {"n": 1}
    cache.bump("ubump")
    assert fake(db=None, current_user=U()) == {"n": 2}


def test_no_user_bypass():
    calls = []

    @cache.cached_response(ttl=60)
    def fake(db=None, current_user=None):
        calls.append(1)
        return {"n": len(calls)}

    assert fake(db=None, current_user=None) == {"n": 1}
    assert fake(db=None, current_user=None) == {"n": 2}


def test_user_cache_and_invalidate():
    class U:
        id = "uu1"
        profile = None

    assert cache.get_cached_user("tok-x") is None
    cache.cache_user("tok-x", U())
    got = cache.get_cached_user("tok-x")
    assert got is not None and got.id == "uu1"
    cache.invalidate_user_by_id("uu1")
    assert cache.get_cached_user("tok-x") is None
