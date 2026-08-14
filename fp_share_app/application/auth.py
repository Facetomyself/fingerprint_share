"""管理员验证：pbkdf2 密码校验 + 签名 session + 登录防爆破。"""

from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import Depends, HTTPException, Request

from ..config.settings import Settings, get_settings
from ..infrastructure.session_store import create_serializer, verify_session

PASSWORD_SCHEME = "$pbkdf2-sha256$"

# 防爆破状态：ip -> [连续失败次数, 冷却截止时间戳]
_brute_state: dict[str, list[int, float]] = {}


def parse_password_hash(hash_value: str) -> tuple[int, bytes, bytes]:
    """解析 $pbkdf2-sha256$<iterations>$<salt_hex>$<hash_hex>。"""
    if not hash_value.startswith(PASSWORD_SCHEME):
        raise ValueError(f"不支持的密码 hash 格式（应为 {PASSWORD_SCHEME}...）")
    parts = hash_value.split("$")
    if len(parts) != 5:
        raise ValueError("密码 hash 字段数不正确")
    iterations = int(parts[2])
    salt = bytes.fromhex(parts[3])
    digest = bytes.fromhex(parts[4])
    return iterations, salt, digest


def make_password_hash(password: str, iterations: int = 260000) -> str:
    salt = hashlib.sha256(str(time.time_ns()).encode()).digest()[:16]
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{PASSWORD_SCHEME}{iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, hash_value: str) -> bool:
    try:
        iterations, salt, expected = parse_password_hash(hash_value)
    except (ValueError, IndexError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_brute_block(ip: str) -> bool:
    """冷却期内返回 True（应拒绝登录尝试）。"""
    state = _brute_state.get(ip)
    if state is None:
        return False
    _, cooldown_until = state
    if time.time() >= cooldown_until:
        _brute_state.pop(ip, None)
        return False
    return True


def record_login_failure(ip: str) -> None:
    failures, _ = _brute_state.get(ip, (0, 0.0))
    failures += 1
    cooldown_until = time.time() + 30.0 if failures >= 3 else 0.0
    _brute_state[ip] = [failures, cooldown_until]


def clear_login_failures(ip: str) -> None:
    _brute_state.pop(ip, None)


def admin_required(request: Request, settings: Settings = Depends(get_settings)):
    """FastAPI 依赖：验签 fp_session cookie，失败 401。"""
    cookie = request.cookies.get(settings.session_cookie)
    if not cookie or not settings.secret_key:
        raise HTTPException(status_code=401, detail="未登录")
    serializer = create_serializer(settings.secret_key)
    if not verify_session(serializer, cookie, settings.session_max_age):
        raise HTTPException(status_code=401, detail="会话无效或已过期")
    return True
