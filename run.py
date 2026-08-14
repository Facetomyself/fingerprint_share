"""启动入口：校验配置后启动 uvicorn（绝对路径调用，不依赖 cwd 与 PATH）。"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

import uvicorn  # noqa: E402

from fp_share_app.config.settings import PROJECT_ROOT as APP_ROOT, get_settings  # noqa: E402


def main() -> None:
    settings = get_settings()
    if not settings.is_configured:
        print("配置缺失：请在 .env 中设置 ADMIN_PASSWORD_HASH 与 FP_SECRET_KEY（见 .env.example）",
              file=sys.stderr)
        raise SystemExit(1)
    uvicorn.run(
        "fp_share_app.main:app",
        host=settings.host,
        port=settings.port,
        app_dir=str(APP_ROOT),
    )


if __name__ == "__main__":
    main()
