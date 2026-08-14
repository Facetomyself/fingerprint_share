"""FastAPI 依赖：每请求一个 SQLite 连接。"""

from __future__ import annotations

from ..config.settings import get_settings
from ..infrastructure.db import connect


def get_db():
    settings = get_settings()
    conn = connect(settings.db_path)
    try:
        yield conn
    finally:
        conn.close()
