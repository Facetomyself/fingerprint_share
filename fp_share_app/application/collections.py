"""采集记录用例：ingest / 列表 / 详情 / 导出 / 删除 / 分面（自动分类与筛选）。"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timedelta, timezone

from .entries import SHANGHAI_TZ, now_iso as entry_now_iso

PAGE_SIZE = 50

SUMMARY_KEYS = ["id", "entry_id", "kind", "collected_at", "visitor_ip", "user_agent", "summary", "duration_ms"]

# ---------- 分面提取（UA 自动分类） ----------

_BOT_UA_RE = re.compile(r"bot|crawl|spider|slurp|curl|wget|python-requests|httpie|scrapy|headless", re.I)
_MOBILE_RE = re.compile(r"Mobile|Android.*Mobile|iPhone|iPod", re.I)
_TABLET_RE = re.compile(r"iPad|Tablet|PlayBook|Silk", re.I)
_BROWSER_PATTERNS = [
    ("Edge", re.compile(r"Edg(e|A|iOS)?/")),
    ("Chrome", re.compile(r"Chrome/|CriOS/")),
    ("Firefox", re.compile(r"Firefox/|FxiOS/")),
    ("Safari", re.compile(r"Safari/")),
    ("Opera", re.compile(r"OPR/|Opera/")),
    ("IE", re.compile(r"MSIE |Trident/")),
    ("SamsungBrowser", re.compile(r"SamsungBrowser/")),
    ("UCBrowser", re.compile(r"UCBrowser/|UBrowser/")),
    ("QQBrowser", re.compile(r"QQBrowser/")),
]
_OS_PATTERNS = [
    ("Windows", re.compile(r"Windows NT")),
    ("macOS", re.compile(r"Mac OS X|Macintosh")),
    ("Linux", re.compile(r"Linux")),
    ("Android", re.compile(r"Android")),
    ("iOS", re.compile(r"iPhone|iPad|iPod|iOS")),
]


def extract_facets(payload: dict, user_agent: str | None) -> dict:
    """从 payload 与 UA 提取关键分面（列表展示与筛选用）。

    - uaClass: desktop / mobile / tablet / bot / unknown
    - uaBrowser / os：UA 小类与操作系统
    - timezone / screen / language：仅 environment 记录有意义（behavior 为 None）
    """
    ua = user_agent or ""
    if not ua and isinstance(payload.get("components"), dict):
        nav = payload["components"].get("navigator") or {}
        ua = str(nav.get("userAgent") or "")

    if _BOT_UA_RE.search(ua):
        ua_class = "bot"
    elif _TABLET_RE.search(ua):
        ua_class = "tablet"
    elif _MOBILE_RE.search(ua):
        ua_class = "mobile"
    elif ua:
        ua_class = "desktop"
    else:
        ua_class = "unknown"

    browser = "unknown"
    for name, pattern in _BROWSER_PATTERNS:
        if pattern.search(ua):
            browser = name
            break
    os_name = "unknown"
    for name, pattern in _OS_PATTERNS:
        if pattern.search(ua):
            os_name = name
            break

    facets = {
        "uaClass": ua_class,
        "uaBrowser": browser,
        "os": os_name,
        "timezone": None,
        "screen": None,
        "language": None,
    }
    components = payload.get("components") or {}
    intl = components.get("intl") or {}
    if intl.get("timeZone"):
        facets["timezone"] = str(intl["timeZone"])
    screen = components.get("screen") or {}
    if screen.get("width") and screen.get("height"):
        facets["screen"] = f"{screen['width']}x{screen['height']}"
    nav = components.get("navigator") or {}
    if nav.get("language"):
        facets["language"] = str(nav["language"])
    return facets


FACET_KEYS = ["uaClass", "uaBrowser", "os", "timezone", "screen", "language"]


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
           visitor_ip: str | None = None, user_agent: str | None = None,
           kind: str = "environment", dedup_window_seconds: int = 120) -> int | None:
    """写入一条采集记录，返回记录 id；entry 不存在返回 None。

    summary 自动附加 facets（UA 大类/小类、OS、时区、屏幕、语言）供筛选与展示。
    去重：同 entry + kind + IP + UA 在窗口时间内已有记录则返回 -1（重复）。
    """
    row = conn.execute("SELECT id FROM entries WHERE slug = ?", (entry_slug,)).fetchone()
    if row is None:
        return None
    # 同环境短窗口去重：防标签恢复/后台重载导致的重复上报（窗口为 0 时关闭）
    if dedup_window_seconds > 0:
        cutoff = (datetime.now(SHANGHAI_TZ) - timedelta(seconds=dedup_window_seconds)).isoformat()
        dup = conn.execute(
            "SELECT COUNT(*) FROM collections WHERE entry_id = ? AND kind = ?"
            " AND visitor_ip IS ? AND user_agent IS ? AND collected_at >= ?",
            (row["id"], kind, visitor_ip, user_agent, cutoff),
        ).fetchone()[0]
        if dup > 0:
            return -1
    facets = extract_facets(payload, user_agent)
    if isinstance(summary, dict):
        merged_summary = dict(summary)
    elif isinstance(summary, str):
        try:
            merged_summary = json.loads(summary)
        except json.JSONDecodeError:
            merged_summary = {"raw": summary}
    else:
        merged_summary = {}
    if not isinstance(merged_summary, dict):
        merged_summary = {"raw": summary}
    merged_summary["facets"] = facets
    cur = conn.execute(
        "INSERT INTO collections (entry_id, kind, collected_at, visitor_ip, user_agent, payload, summary, duration_ms)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            row["id"],
            kind,
            datetime.now(SHANGHAI_TZ).isoformat(),
            visitor_ip,
            user_agent,
            json.dumps(payload, ensure_ascii=False),
            _parse_summary(merged_summary),
            duration_ms,
        ),
    )
    conn.commit()
    return cur.lastrowid


def collection_summary_row(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in SUMMARY_KEYS}


def list_collections(conn: sqlite3.Connection, entry_id: int | None = None,
                     kind: str | None = None,
                     facets: dict[str, str] | None = None,
                     page: int = 1, page_size: int = PAGE_SIZE) -> dict:
    """分页列表（不含 payload 全文）；支持 facets 分面筛选（summary JSON 内 json_extract）。"""
    sql = "SELECT id, entry_id, kind, collected_at, visitor_ip, user_agent, summary, duration_ms FROM collections"
    where_clauses = []
    params: list = []
    if entry_id is not None:
        where_clauses.append("entry_id = ?")
        params.append(entry_id)
    if kind is not None:
        where_clauses.append("kind = ?")
        params.append(kind)
    for key in FACET_KEYS:
        if facets and facets.get(key):
            where_clauses.append(f"json_extract(summary, '$.facets.{key}') = ?")
            params.append(facets[key])
    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    total = conn.execute(f"SELECT COUNT(*) FROM collections{where_sql}", tuple(params)).fetchone()[0]
    sql += where_sql + " ORDER BY id DESC LIMIT ? OFFSET ?"
    rows = conn.execute(sql, (*params, page_size, max(0, page - 1) * page_size)).fetchall()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [collection_summary_row(r) for r in rows],
    }


def list_facets(conn: sqlite3.Connection, entry_id: int | None = None,
                kind: str | None = None) -> dict:
    """聚合各分面维度的可选值与计数（供筛选面板下拉）。"""
    where_clauses = []
    params: list = []
    if entry_id is not None:
        where_clauses.append("entry_id = ?")
        params.append(entry_id)
    if kind is not None:
        where_clauses.append("kind = ?")
        params.append(kind)
    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    result: dict[str, dict[str, int]] = {}
    for key in FACET_KEYS:
        counts: dict[str, int] = {}
        rows = conn.execute(
            f"SELECT json_extract(summary, '$.facets.{key}') AS v, COUNT(*) AS c"
            f" FROM collections{where_sql} GROUP BY v",
            tuple(params),
        ).fetchall()
        for row in rows:
            value = row["v"] if row["v"] is not None else "unknown"
            counts[value] = row["c"]
        result[key] = dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))
    return result


def get_collection(conn: sqlite3.Connection, collection_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM collections WHERE id = ?", (collection_id,)).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "entry_id": row["entry_id"],
        "kind": row["kind"],
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


def export_collections(conn: sqlite3.Connection, entry_id: int | None = None,
                       kind: str | None = None,
                       facets: dict[str, str] | None = None) -> dict:
    """导出全部记录（含完整 payload）；支持 facets 分面筛选。"""
    sql = "SELECT * FROM collections"
    where_clauses = []
    params: list = []
    if entry_id is not None:
        where_clauses.append("entry_id = ?")
        params.append(entry_id)
    if kind is not None:
        where_clauses.append("kind = ?")
        params.append(kind)
    for key in FACET_KEYS:
        if facets and facets.get(key):
            where_clauses.append(f"json_extract(summary, '$.facets.{key}') = ?")
            params.append(facets[key])
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)
    sql += " ORDER BY id"
    records = []
    for row in conn.execute(sql, tuple(params)):
        records.append({
            "id": row["id"],
            "entry_id": row["entry_id"],
            "kind": row["kind"],
            "collected_at": row["collected_at"],
            "visitor_ip": row["visitor_ip"],
            "user_agent": row["user_agent"],
            "payload": json.loads(row["payload"]),
            "summary": row["summary"],
            "duration_ms": row["duration_ms"],
        })
    return {
        "exported_at": datetime.now(SHANGHAI_TZ).isoformat(),
        "entry_id": entry_id,
        "kind": kind,
        "count": len(records),
        "records": records,
    }
