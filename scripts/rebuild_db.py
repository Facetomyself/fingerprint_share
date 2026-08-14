"""清库重建：DROP entries + collections → 重建 schema → 播种。

运行前必须停止服务（run.py / uvicorn）。默认 dry-run 只打印计划，需 --yes 才执行。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fp_share_app.application.seed import seed_entries  # noqa: E402
from fp_share_app.config.settings import get_settings  # noqa: E402
from fp_share_app.infrastructure.db import connect, init_db  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="清库重建 fingerprint_share 数据库")
    parser.add_argument("--yes", action="store_true", help="确认执行（默认 dry-run）")
    args = parser.parse_args()

    settings = get_settings()
    conn = connect(settings.db_path)
    try:
        entries_count = conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        collections_count = conn.execute("SELECT COUNT(*) FROM collections").fetchone()[0]
    finally:
        pass

    print(f"db: {settings.db_path}")
    print(f"当前数据: entries={entries_count}, collections={collections_count}")
    print("计划: DROP TABLE collections -> DROP TABLE entries -> 建表 -> 播种")
    if not args.yes:
        print("[dry-run] 未执行。确认无误后加 --yes 重跑。")
        return 0

    conn.execute("DROP TABLE IF EXISTS collections")
    conn.execute("DROP TABLE IF EXISTS entries")
    conn.commit()
    init_db(conn)
    result = seed_entries(conn, PROJECT_ROOT)
    print(f"重建完成: seeded={result['seeded']} skipped_missing={result['skipped_missing']}")
    if result["skipped_missing"]:
        print("警告: 有种子 JS 文件缺失（见上），补齐文件后重启服务或重跑本脚本可补种。")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
