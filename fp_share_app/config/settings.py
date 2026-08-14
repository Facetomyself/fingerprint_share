"""应用配置：环境变量优先，其次项目根 .env 文件。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path) -> dict[str, str]:
    """极简 .env 解析（KEY=VALUE，支持 # 注释），不引入 python-dotenv。"""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


@dataclass(frozen=True)
class Settings:
    admin_password_hash: str = ""
    secret_key: str = ""
    db_path: Path = field(default_factory=lambda: PROJECT_ROOT / "data" / "fingerprint_share.db")
    host: str = "127.0.0.1"
    port: int = 8000
    session_max_age: int = 43200
    session_cookie: str = "fp_session"
    ingest_max_bytes: int = 512 * 1024

    @property
    def is_configured(self) -> bool:
        return bool(self.admin_password_hash and self.secret_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """读取配置：进程环境变量覆盖 .env 文件。"""
    dotenv = _load_dotenv(PROJECT_ROOT / ".env")
    get = lambda key: os.environ.get(key) or dotenv.get(key) or ""  # noqa: E731

    db_path = get("FP_DB_PATH") or "data/fingerprint_share.db"
    db_full = Path(db_path)
    if not db_full.is_absolute():
        db_full = PROJECT_ROOT / db_full

    return Settings(
        admin_password_hash=get("ADMIN_PASSWORD_HASH"),
        secret_key=get("FP_SECRET_KEY"),
        db_path=db_full,
        host=get("FP_HOST") or "127.0.0.1",
        port=int(get("FP_PORT") or 8000),
        session_max_age=int(get("FP_SESSION_MAX_AGE") or 43200),
    )
