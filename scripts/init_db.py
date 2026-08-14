"""初始化数据库：建表 + 种子条目（幂等，可重复运行）。"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fp_share_app.application.seed import seed_entries  # noqa: E402
from fp_share_app.config.settings import get_settings  # noqa: E402
from fp_share_app.infrastructure.db import connect  # noqa: E402


def main() -> int:
    settings = get_settings()
    conn = connect(settings.db_path)
    try:
        result = seed_entries(conn, PROJECT_ROOT)
    finally:
        conn.close()
    print(f"db: {settings.db_path}")
    print(f"seeded: {result['seeded']}")
    if result["skipped_missing"]:
        print("skipped (js file missing):")
        for path in result["skipped_missing"]:
            print(f"  - {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
