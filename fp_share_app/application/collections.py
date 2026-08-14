"""采集记录用例：ingest / 列表 / 详情 / 导出 / 删除。"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

PAGE_SIZE = 50

SUMMARY_KEYS = ["id", "entry_id", "collected_at", "visitor_ip", "user_agent", "summary", "duration_ms"]


def _parse_summary(summary) -> str | None:
    """summary 可以是 dict 或 JSON 字符串；统一落盘为 JSON 字符串或 NULL。"""
    if summary is None:
        return None
    if isinstance(summary, str):
        try:
            json.loads(summary)
            return summary
        except json.JSONDecodeError:
            return json.dumps({"raw": summary}, ensure_ascii=False)
    return json.dumps(summary, ensure_ascii=False)


def ingest(conn: sqlite3.Connection, entry_slug: str, payload: dict,
           summary=None, duration_ms: int | None = None,
           visitor_ip: str | None = None, user_agent: str | None = None) -> int | None:
    """写入一条采集记录，返回记录 id；entry 不存在返回 None。"""
    row = conn.execute("SELECT id FROM entries WHERE slug = ?", (entry_slug,)).fetchone()
    if row is None:
        return None
    cur = conn.execute(
        "INSERT INTO collections (entry_id, collected_at, visitor_ip, user_agent, payload, summary, duration_ms)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            row["id"],
            datetime.now(timezone.utc).isoformat(),
            visitor_ip,
            user_agent,
            json.dumps(payload, ensure_ascii=False),
            _parse_summary(summary),
            duration_ms,
        ),
    )
    conn.commit()
    return cur.lastrowid


def collection_summary_row(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in SUMMARY_KEYS}


def list_collections(conn: sqlite3.Connection, entry_id: int | None = None,
                     page: int = 1, page_size: int = PAGE_SIZE) -> dict:
    """分页列表（不含 payload 全文）。"""
    sql = "SELECT id, entry_id, collected_at, visitor_ip, user_agent, summary, duration_ms FROM collections"
    params: tuple = ()
    if entry_id is not None:
        sql += " WHERE entry_id = ?"
        params = (entry_id,)
    total = conn.execute(f"SELECT COUNT(*) FROM collections{(' WHERE entry_id = ?' if entry_id is not None else '')}",
                         params).fetchone()[0]
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    rows = conn.execute(sql, (*params, page_size, max(0, page - 1) * page_size)).fetchall()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [collection_summary_row(r) for r in rows],
    }


def get_collection(conn: sqlite3.Connection, collection_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM collections WHERE id = ?", (collection_id,)).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "entry_id": row["entry_id"],
        "collected_at": row["collected_at"],
        "visitor_ip": row["visitor_ip"],
        "user_agent": row["user_agent"],
        "payload": json.loads(row["payload"]),
        "summary": row["summary"],
        "duration_ms": row["duration_ms"],
    }


def delete_collection(conn: sqlite3.Connection, collection_id: int) -> bool:
    cur = conn.execute("DELETE FROM collections WHERE id = ?", (collection_id,))
    conn.commit()
    return cur.rowcount > 0


def export_collections(conn: sqlite3.Connection, entry_id: int | None = None) -> dict:
    """导出全部记录（含完整 payload）。"""
    sql = "SELECT * FROM collections"
    params: tuple = ()
    if entry_id is not None:
        sql += " WHERE entry_id = ?"
        params = (entry_id,)
    sql += " ORDER BY id"
    records = []
    for row in conn.execute(sql, params):
        records.append({
            "id": row["id"],
            "entry_id": row["entry_id"],
            "collected_at": row["collected_at"],
            "visitor_ip": row["visitor_ip"],
            "user_agent": row["user_agent"],
            "payload": json.loads(row["payload"]),
            "summary": row["summary"],
            "duration_ms": row["duration_ms"],
        })
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "entry_id": entry_id,
        "count": len(records),
        "records": records,
    }
