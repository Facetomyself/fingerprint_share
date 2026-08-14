"""SQLite 连接与建表。sqlite3 直用，无 ORM。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    risk_type    TEXT NOT NULL,
    website      TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    collect_js   TEXT NOT NULL,
    version      TEXT NOT NULL DEFAULT 'v1',
    has_behavior INTEGER NOT NULL DEFAULT 1 CHECK (has_behavior IN (0, 1)),
    page_module  TEXT NOT NULL DEFAULT '',
    tags         TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_risk_type ON entries(risk_type);

CREATE TABLE IF NOT EXISTS collections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id     INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL DEFAULT 'environment'
                 CHECK (kind IN ('environment','behavior')),
    collected_at TEXT NOT NULL,
    visitor_ip   TEXT,
    user_agent   TEXT,
    payload      TEXT NOT NULL,
    summary      TEXT,
    duration_ms  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_collections_entry_kind_time
    ON collections(entry_id, kind, collected_at);
"""


def connect(db_path: str | Path) -> sqlite3.Connection:
    """打开连接：WAL、外键、busy_timeout。db_path 的父目录不存在时创建。

    check_same_thread=False：FastAPI 的同步依赖在 threadpool 线程建连，
    async 端点可能在事件循环线程使用同一连接；本应用每请求一个连接、
    不跨请求共享，关闭该检查是安全的。
    """
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=5.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """幂等建表。"""
    conn.executescript(SCHEMA)
    conn.commit()
