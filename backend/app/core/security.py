import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Any
import jwt
from app.core.config import settings

def hash_password(password: str) -> str:
    """Hash password using PBKDF2 with SHA-256 and salt for secure, zero-dependency hashing."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}:{key.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its stored hash."""
    try:
        salt, stored_hash = hashed_password.split(':')
        key = hashlib.pbkdf2_hmac(
            'sha256',
            plain_password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return secrets.compare_digest(key.hex(), stored_hash)
    except Exception:
        return False

def create_access_token(subject: str | Any, expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived JWT access token (type=access)."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    # jti: định danh duy nhất mỗi lần cấp token (hỗ trợ rotation & revoke sau này)
    to_encode = {"sub": str(subject), "exp": expire, "type": "access", "jti": secrets.token_hex(8)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(subject: str | Any, expires_delta: Optional[timedelta] = None) -> str:
    """Create a long-lived JWT refresh token (type=refresh). KHÔNG dùng để gọi API."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = {"sub": str(subject), "exp": expire, "type": "refresh", "jti": secrets.token_hex(8)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[str]:
    """Decode JWT access token and return subject (user id)."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # Refresh token KHÔNG được dùng như access token
        if payload.get("type") == "refresh":
            return None
        return payload.get("sub")
    except Exception:
        return None

def decode_refresh_token(token: str) -> Optional[str]:
    """Decode JWT refresh token and return subject (user id)."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except Exception:
        return None
