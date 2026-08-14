"""生成管理员密码 hash（pbkdf2-sha256），输出填入 .env 的 ADMIN_PASSWORD_HASH。

用法：
  python scripts/hash_password.py            # 交互输入（不回显）
  python scripts/hash_password.py --password 'xxx'   # 显式传入（注意 shell 历史）
"""

from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fp_share_app.application.auth import make_password_hash  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="生成管理员密码 hash")
    parser.add_argument("--password", help="明文密码（省略则交互输入，不回显）")
    args = parser.parse_args()

    pw = args.password if args.password is not None else getpass.getpass("管理员密码: ")
    if not pw:
        print("密码不能为空", file=sys.stderr)
        return 1

    print(make_password_hash(pw))
    print()
    print("将以上 hash 填入项目 .env 的 ADMIN_PASSWORD_HASH= 后，重启服务生效。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
