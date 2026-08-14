"""种子条目：首次初始化时从 collect_js/ 读入首版模板。仅在 entries 表为空时播种。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from ..infrastructure.db import init_db

SEED_ENTRIES = [
    {
        "slug": "generic-deep-v3",
        "name": "通用-deep-fingerprint-v3",
        "description": "深度浏览器指纹基线 v3：environment 快照 32 组 + deepProbes 谎言检测三层"
                       "（queryLies 10 接口 ~20 项检查 / prototypeLies 40+ 接口递归 / phantomIframe 对比 / "
                       "双画布稳定性 / plugins-mimeTypes 交叉验证）+ trash 乱码检测 + resistance"
                       "（timer precision/RFP/Brave/Tor/扩展哈希）。行为指纹走独立行为采集页。"
                       "机制参考 CreepJS (MIT)，自写实现。",
        "version": "v3",
        "js_file": "collect_js/generic-deep-v3.js",
    },
]


def seed_entries(conn: sqlite3.Connection, project_root: Path) -> dict:
    """幂等播种：返回 {seeded: int, skipped_missing: [...]}。"""
    init_db(conn)
    existing = conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
    if existing > 0:
        return {"seeded": 0, "skipped_missing": []}

    from .entries import create_entry

    seeded = 0
    skipped = []
    for spec in SEED_ENTRIES:
        js_path = project_root / spec["js_file"]
        if not js_path.is_file():
            skipped.append(str(js_path))
            continue
        collect_js = js_path.read_text(encoding="utf-8")
        entry = create_entry(
            conn, spec["name"], collect_js,
            description=spec["description"], version=spec["version"],
        )
        # 种子条目使用固定 slug，覆盖自动生成的 slug
        conn.execute("UPDATE entries SET slug = ? WHERE id = ?", (spec["slug"], entry["id"]))
        conn.commit()
        seeded += 1
    return {"seeded": seeded, "skipped_missing": skipped}
