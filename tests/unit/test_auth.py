"""密码 hash 与 session 签名。"""

from __future__ import annotations

from fp_share_app.application.auth import (
    make_password_hash,
    parse_password_hash,
    verify_password,
)
from fp_share_app.infrastructure.session_store import (
    create_serializer,
    sign_session,
    verify_session,
)


def test_password_hash_roundtrip():
    hashed = make_password_hash("s3cret-pw")
    iterations, salt, digest = parse_password_hash(hashed)
    assert iterations >= 100000
    assert len(salt) == 16
    assert len(digest) == 32
    assert verify_password("s3cret-pw", hashed) is True
    assert verify_password("wrong-pw", hashed) is False


def test_password_hash_malformed():
    assert verify_password("x", "") is False
    assert verify_password("x", "garbage") is False
    assert verify_password("x", "$pbkdf2-sha256$abc$zz$yy") is False


def test_session_sign_and_verify():
    serializer = create_serializer("test-secret-key")
    token = sign_session(serializer)
    assert verify_session(serializer, token, max_age=3600) is True
    assert verify_session(serializer, "tampered", max_age=3600) is False


def test_session_expired():
    serializer = create_serializer("test-secret-key")
    token = sign_session(serializer)
    assert verify_session(serializer, token, max_age=-1) is False
