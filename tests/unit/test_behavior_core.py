"""pytest 包装：subprocess 跑 node 直跑 behavior-core 纯函数测试。"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
NODE = r"D:\reverse_ENV\tools\node\node.exe"
TEST_JS = PROJECT_ROOT / "tests" / "js" / "behavior-core.test.js"


def test_behavior_core_node():
    if not Path(NODE).is_file():
        pytest.skip("node 运行时不可用")
    completed = subprocess.run(
        [NODE, str(TEST_JS)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert completed.returncode == 0, f"behavior-core 测试失败:\n{completed.stdout}\n{completed.stderr}"
    assert "ALL PASS" in completed.stdout
