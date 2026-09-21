"""Cache response GET theo user (TTL ngắn) cho DB xa (Neon US, RTT ~250ms).

- GET hot endpoints bọc bằng @cached_response(ttl=...): key = (user_id, version, fn, params).
- Mọi request ghi (POST/PATCH/PUT/DELETE) thành công tự bump version qua middleware
  (xem app/main.py) -> mutation xong đọc lại luôn tươi, không stale.
- Thread-safe, in-memory (1 worker dev; production nhiều worker thì mỗi worker cache
  riêng — vẫn đúng vì TTL ngắn, chỉ kém hit-rate).
"""
import functools
import threading
import time

_lock = threading.Lock()
_store: dict = {}
_versions: dict = {}

_SKIP_KEYS = {"db", "current_user", "request"}


# ---- Cache user đã auth theo token (giảm 1 RTT DB mỗi request) ----
# Lưu object User detached (đã load đủ columns + profile qua joinedload).
# get_current_user merge(load=False) vào session của request -> đọc/ghi bình thường,
# không tốn SELECT. PUT /auth/profile và onboarding/complete phải gọi
# invalidate_user_by_id để lần sau đọc tươi.
_user_store: dict = {}  # token -> (expires, user, uid)
_uid_tokens: dict = {}  # uid -> set(token)


def cache_user(token: str, user, ttl: int = 45) -> None:
    if not token or user is None:
        return
    uid = getattr(user, "id", None)
    # Chỉ cache khi profile đã load (tránh lazy-load sau này)
    try:
        _ = user.profile
    except Exception:
        return
    with _lock:
        _user_store[token] = (time.monotonic() + ttl, user, uid)
        if uid:
            _uid_tokens.setdefault(uid, set()).add(token)
        if len(_user_store) > 500:
            for k in list(_user_store.keys())[:100]:
                _user_store.pop(k, None)


def get_cached_user(token: str):
    if not token:
        return None
    with _lock:
        hit = _user_store.get(token)
        if not hit or hit[0] <= time.monotonic():
            if hit:
                _user_store.pop(token, None)
            return None
        return hit[1]


def invalidate_user_by_id(uid: str) -> None:
    if not uid:
        return
    with _lock:
        for tok in _uid_tokens.pop(uid, set()):
            _user_store.pop(tok, None)


def get_version(user_id: str) -> int:
    return _versions.get(user_id, 0)


def bump(user_id: str) -> None:
    if not user_id:
        return
    with _lock:
        _versions[user_id] = _versions.get(user_id, 0) + 1


def _make_key(fn, args, kwargs, uid: str) -> tuple:
    parts = [getattr(fn, "__name__", "fn")]
    request = kwargs.get("request", None)
    if request is not None:
        parts.append(request.url.path)
        parts.append(str(request.url.query))
    for k in sorted(kwargs.keys()):
        if k in _SKIP_KEYS:
            continue
        try:
            parts.append(f"{k}={kwargs[k]!r}"[:200])
        except Exception:
            parts.append(f"{k}=?")
    for a in args:
        # Bỏ qua Session/User object (repr chứa địa chỉ nhớ, đổi mỗi request)
        if type(a).__name__ in ("Session", "User", "AsyncSession"):
            continue
        try:
            parts.append(repr(a)[:200])
        except Exception:
            parts.append("?")
    return (uid, get_version(uid), tuple(parts))


def cached_response(ttl: int = 45):
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            user = kwargs.get("current_user")
            uid = getattr(user, "id", None) if user is not None else None
            # Không xác định user -> bỏ qua cache cho an toàn
            if not uid:
                return fn(*args, **kwargs)
            key = _make_key(fn, args, kwargs, uid)
            now = time.monotonic()
            with _lock:
                hit = _store.get(key)
                if hit and hit[0] > now:
                    return hit[1]
            data = fn(*args, **kwargs)
            with _lock:
                _store[key] = (now + ttl, data)
                # Chống phình RAM: giữ tối đa ~2000 entries
                if len(_store) > 2000:
                    for k in list(_store.keys())[:500]:
                        _store.pop(k, None)
            return data

        return wrapper

    return deco
