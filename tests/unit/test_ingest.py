"""采集记录 ingest / 列表 / 详情 / 导出 / 删除。"""

from __future__ import annotations

import json

from fp_share_app.application import collections as collections_uc
from fp_share_app.application import entries as entries_uc


def _seed_entry(conn):
    return entries_uc.create_entry(conn, "DataDome-radwell.com", "js")


def test_ingest_unknown_entry(conn):
    assert collections_uc.ingest(conn, "no-such-entry", {"a": 1}) is None


def test_ingest_and_list(conn):
    entry = _seed_entry(conn)
    record_id = collections_uc.ingest(
        conn, entry["slug"], {"visitorId": "abc123", "components": {}},
        summary={"visitorId": "abc123", "dimensions": 3},
        duration_ms=42, visitor_ip="127.0.0.1", user_agent="test-agent",
    )
    assert record_id is not None

    listing = collections_uc.list_collections(conn, entry_id=entry["id"])
    assert listing["total"] == 1
    item = listing["items"][0]
    assert "payload" not in item
    assert item["visitor_ip"] == "127.0.0.1"
    assert json.loads(item["summary"])["visitorId"] == "abc123"


def test_get_collection_full_payload(conn):
    entry = _seed_entry(conn)
    record_id = collections_uc.ingest(conn, entry["slug"], {"visitorId": "full"})
    record = collections_uc.get_collection(conn, record_id)
    assert record["payload"] == {"visitorId": "full"}
    assert collections_uc.get_collection(conn, 9999) is None


def test_export(conn):
    entry = _seed_entry(conn)
    collections_uc.ingest(conn, entry["slug"], {"visitorId": "one"})
    collections_uc.ingest(conn, entry["slug"], {"visitorId": "two"})
    data = collections_uc.export_collections(conn, entry_id=entry["id"])
    assert data["count"] == 2
    assert {r["payload"]["visitorId"] for r in data["records"]} == {"one", "two"}


def test_delete_collection(conn):
    entry = _seed_entry(conn)
    record_id = collections_uc.ingest(conn, entry["slug"], {"visitorId": "del"})
    assert collections_uc.delete_collection(conn, record_id) is True
    assert collections_uc.delete_collection(conn, record_id) is False
    assert conn.execute("SELECT COUNT(*) FROM collections").fetchone()[0] == 0


def test_ingest_summary_string_and_dict(conn):
    entry = _seed_entry(conn)
    id_dict = collections_uc.ingest(conn, entry["slug"], {"a": 1}, summary={"k": "v"})
    id_str = collections_uc.ingest(conn, entry["slug"], {"a": 1}, summary='{"k": "v"}')
    for record_id in (id_dict, id_str):
        row = conn.execute("SELECT summary FROM collections WHERE id = ?", (record_id,)).fetchone()
        assert json.loads(row["summary"]) == {"k": "v"}
