"""采集条目用例：命名规则校验、slug 生成、CRUD。"""

from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime, timezone

# 命名白名单：大小写字母、数字、中文、点、下划线、连字符
NAME_RE = re.compile(r"^[A-Za-z0-9一-鿿._-]+$")


class NameValidationError(ValueError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_name(name: str) -> tuple[str, str]:
    """name 必须为「风控类型-网站」两段，返回 (risk_type, website)。"""
    if not name or not NAME_RE.match(name):
        raise NameValidationError("name 含非法字符（允许字母/数字/中文/._-）")
    if "-" not in name:
        raise NameValidationError("name 必须为「风控类型-网站」两段，如 DataDome-radwell.com")
    risk_type, website = name.split("-", 1)
    if not risk_type.strip() or not website.strip():
        raise NameValidationError("风控类型与网站两段均不能为空")
    return risk_type, website


def generate_slug(name: str) -> str:
    """由 name 生成 URL 安全 slug（保留 . 与 -）。

    全中文等场景生成的残迹过短（<4 字符）视为无效，返回空串，
    由 create_entry 回退为 entry-<id>。
    """
    slug = re.sub(r"[^a-z0-9.-]+", "-", name.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug if len(slug) >= 4 else ""


def ensure_unique_slug(conn: sqlite3.Connection, slug: str) -> str:
    """冲突时追加 -2/-3 后缀；空 slug 用临时随机值（由调用方替换为 entry-<id>）。"""
    if not slug:
        return f"pending-{uuid.uuid4().hex[:8]}"
    candidate = slug
    counter = 2
    while conn.execute("SELECT 1 FROM entries WHERE slug = ?", (candidate,)).fetchone():
        candidate = f"{slug}-{counter}"
        counter += 1
    return candidate


def entry_row_to_dict(row: sqlite3.Row, with_js: bool = False, with_module: bool = False) -> dict:
    keys = ["id", "slug", "name", "risk_type", "website", "description", "version",
            "has_behavior", "created_at", "updated_at"]
    if with_js:
        keys.append("collect_js")
    if with_module:
        keys.append("page_module")
    return {k: row[k] for k in keys}


def has_page_module(row: sqlite3.Row) -> bool:
    return bool((row["page_module"] or "").strip()) if "page_module" in row.keys() else False


def list_entries(conn: sqlite3.Connection, with_js: bool = False, risk_type: str | None = None,
                 with_module: bool = False) -> list[dict]:
    sql = "SELECT * FROM entries"
    params: tuple = ()
    if risk_type:
        sql += " WHERE risk_type = ?"
        params = (risk_type,)
    sql += " ORDER BY risk_type, website, id"
    return [entry_row_to_dict(r, with_js, with_module) for r in conn.execute(sql, params)]


def get_entry(conn: sqlite3.Connection, slug: str, with_js: bool = True,
              with_module: bool = False) -> dict | None:
    row = conn.execute("SELECT * FROM entries WHERE slug = ?", (slug,)).fetchone()
    return entry_row_to_dict(row, with_js, with_module) if row else None


def create_entry(conn: sqlite3.Connection, name: str, collect_js: str,
                 description: str = "", version: str = "v1",
                 has_behavior: int = 1, page_module: str = "") -> dict:
    """新建条目：校验命名 → 生成 slug → 插入。slug 为空时以 entry-<id> 落定。"""
    if not collect_js.strip():
        raise NameValidationError("collect_js 不能为空")
    risk_type, website = parse_name(name)
    slug = ensure_unique_slug(conn, generate_slug(name))
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO entries (slug, name, risk_type, website, description, collect_js, version,"
        " has_behavior, page_module, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (slug, name, risk_type, website, description.strip(), collect_js, version,
         int(has_behavior), page_module or "", ts, ts),
    )
    if slug.startswith("pending-"):
        slug = f"entry-{cur.lastrowid}"
        conn.execute("UPDATE entries SET slug = ? WHERE id = ?", (slug, cur.lastrowid))
    conn.commit()
    return get_entry(conn, slug, with_js=True)


def update_entry(conn: sqlite3.Connection, slug: str, *, name: str | None = None,
                 collect_js: str | None = None, description: str | None = None,
                 version: str | None = None, has_behavior: int | None = None,
                 page_module: str | None = None) -> dict | None:
    """编辑条目：支持部分更新；改 name 时同步 risk_type/website。"""
    row = conn.execute("SELECT * FROM entries WHERE slug = ?", (slug,)).fetchone()
    if row is None:
        return None
    new_name = name if name is not None else row["name"]
    risk_type, website = parse_name(new_name)
    new_js = collect_js if collect_js is not None else row["collect_js"]
    if not new_js.strip():
        raise NameValidationError("collect_js 不能为空")
    conn.execute(
        "UPDATE entries SET name = ?, risk_type = ?, website = ?, collect_js = ?, description = ?,"
        " version = ?, has_behavior = ?, page_module = ?, updated_at = ? WHERE id = ?",
        (
            new_name, risk_type, website, new_js,
            description if description is not None else row["description"],
            version if version is not None else row["version"],
            int(has_behavior) if has_behavior is not None else row["has_behavior"],
            page_module if page_module is not None else row["page_module"],
            now_iso(), row["id"],
        ),
    )
    conn.commit()
    return get_entry(conn, slug, with_js=True, with_module=True)


def delete_entry(conn: sqlite3.Connection, slug: str) -> bool:
    """删除条目（CASCADE 连带清理采集记录）。"""
    cur = conn.execute("DELETE FROM entries WHERE slug = ?", (slug,))
    conn.commit()
    return cur.rowcount > 0
