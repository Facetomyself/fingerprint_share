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
    {
        "slug": "datadome-radwell.com",
        "name": "DataDome-radwell.com",
        "description": "DataDome tags.js 5.9.0 专有探测面：dd 全局形状 / eventCounters 计数结构 / "
                       "cid 形状生成 / request envelope 输入面 / defineProperty 可覆写性 / storage dd 键名。"
                       "来源 workspace/radwell（jspl 九字段 envelope 研究）。",
        "version": "v1",
        "js_file": "collect_js/datadome-5.9.0-radwell.js",
    },
    {
        "slug": "ruishu-rs6-electricity",
        "name": "瑞数6-electricity-ruishu-web-v2",
        "description": "瑞数 6 挑战页专有环境面：$_ts 全局形状 / script 结构 / meta 与 URL 参数名结构 / "
                       "cookie 键名形状 / DOM gate 原型链。来源 workspace/electricity-ruishu-web-v2。",
        "version": "v1",
        "js_file": "collect_js/ruishu-rs6-challenge-electricity.js",
    },
    {
        "slug": "feilin-51job",
        "name": "飞林-51job.com",
        "description": "飞林 FeiLin v1.4.2 反调试完整性面：toString 深度 / document.all 行为 / 扩展脚本检测 / "
                       "回调完整性 / 插件一致性 / 飞林 SDK 全局。来源 workspace/51job-web-reverse。",
        "version": "v1",
        "js_file": "collect_js/feilin-device-fingerprint-51job.js",
    },
    {
        "slug": "imperva-canadiannorth.com",
        "name": "Imperva-canadiannorth.com",
        "description": "Imperva Incapsula challenge 求值面：incap cookie 键名形状 / script src 结构 / "
                       "时钟精度 / XHR fetch 完整性 / 音频渲染耗时。来源 workspace/canadiannorth-imperva-v1。",
        "version": "v1",
        "js_file": "collect_js/imperva-reese84-canadiannorth.js",
    },
    {
        "slug": "boss-zhipin.com",
        "name": "BOSS-zhipin.com",
        "description": "BOSS 直聘 security-js 设备指纹面：WebGL readPixels 行为 / 设备指纹字段组合 / "
                       "console 序列化侧信道 / 输入事件面 / 资源域名分组。来源 workspace/boss。",
        "version": "v1",
        "js_file": "collect_js/zhipin-security-js-boss.js",
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
