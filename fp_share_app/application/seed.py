"""种子条目：首次初始化时从 collect_js/ 读入首版模板。仅在 entries 表为空时播种。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from ..infrastructure.db import init_db

SEED_ENTRIES = [
    {
        "slug": "generic-browser-env-v1",
        "name": "通用-浏览器环境基线",
        "description": "通用浏览器环境指纹基线模板 v2：30 组件。navigator 20+ 字段/screen/viewport/双 Canvas hash/"
                       "WebGL 18 参数/OffscreenCanvas/AudioContext/原型行为探测（hasFocus/setProperty descriptor）/"
                       "plugins 深度/字体测量/automation flags/WebRTC/API 表面矩阵/timing 全字段/iframe realm 深度/"
                       "cookie-history/媒体能力/Worker/Intl/时区。维度对齐 radwell DataDome 环境面研究"
                       "（browser 189 终端探测分类），设计参考 FingerprintJS v5 (MIT)。",
        "version": "v2",
        "js_file": "collect_js/generic-browser-env-v2.js",
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
