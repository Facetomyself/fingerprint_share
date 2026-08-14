"""测试 fixture：临时 SQLite 连接。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fp_share_app.infrastructure.db import connect, init_db  # noqa: E402


@pytest.fixture
def conn(tmp_path):
    db_path = tmp_path / "test.db"
    connection = connect(db_path)
    init_db(connection)
    yield connection
    connection.close()
