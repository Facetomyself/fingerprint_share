"""itsdangerous 签名 session：无状态 cookie，重启不掉线。"""

from __future__ import annotations

import time

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


def create_serializer(secret_key: str) -> URLSafeTimedSerializer:
    if not secret_key:
        raise ValueError("FP_SECRET_KEY 未配置")
    return URLSafeTimedSerializer(secret_key, salt="fp-session")


def sign_session(serializer: URLSafeTimedSerializer) -> str:
    return serializer.dumps({"sub": "admin", "iat": int(time.time())})


def verify_session(serializer: URLSafeTimedSerializer, value: str, max_age: int) -> bool:
    try:
        data = serializer.loads(value, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return False
    return isinstance(data, dict) and data.get("sub") == "admin"
