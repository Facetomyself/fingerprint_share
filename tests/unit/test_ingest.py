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
        parsed = json.loads(row["summary"])
        assert parsed["k"] == "v"
        assert "facets" in parsed


def test_ingest_facets_extraction(conn):
    entry = _seed_entry(conn)
    payload = {
        "components": {
            "navigator": {"userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
                          "language": "zh-CN"},
            "intl": {"timeZone": "Asia/Shanghai"},
            "screen": {"width": 1920, "height": 1080},
        }
    }
    record_id = collections_uc.ingest(conn, entry["slug"], payload,
                                      user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0")
    row = conn.execute("SELECT summary FROM collections WHERE id = ?", (record_id,)).fetchone()
    facets = json.loads(row["summary"])["facets"]
    assert facets["uaClass"] == "desktop"
    assert facets["uaBrowser"] == "Chrome"
    assert facets["os"] == "Windows"
    assert facets["timezone"] == "Asia/Shanghai"
    assert facets["screen"] == "1920x1080"
    assert facets["language"] == "zh-CN"


def test_ingest_facets_bot_mobile(conn):
    entry = _seed_entry(conn)
    bot_id = collections_uc.ingest(conn, entry["slug"], {"a": 1},
                                   user_agent="python-requests/2.31")
    mobile_id = collections_uc.ingest(conn, entry["slug"], {"a": 1},
                                      user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari/604")
    bot_facets = json.loads(conn.execute(
        "SELECT summary FROM collections WHERE id = ?", (bot_id,)).fetchone()[0])["facets"]
    mobile_facets = json.loads(conn.execute(
        "SELECT summary FROM collections WHERE id = ?", (mobile_id,)).fetchone()[0])["facets"]
    assert bot_facets["uaClass"] == "bot"
    assert mobile_facets["uaClass"] == "mobile"
    assert mobile_facets["uaBrowser"] == "Safari"
    assert mobile_facets["os"] == "iOS"


def test_list_filter_by_facets(conn):
    entry = _seed_entry(conn)
    collections_uc.ingest(conn, entry["slug"], {"a": 1},
                          user_agent="Mozilla/5.0 (Windows NT 10.0) Chrome/120.0")
    collections_uc.ingest(conn, entry["slug"], {"a": 1},
                          user_agent="Mozilla/5.0 (Macintosh) Safari/605.1")
    win = collections_uc.list_collections(conn, facets={"os": "Windows"})
    mac = collections_uc.list_collections(conn, facets={"os": "macOS"})
    assert win["total"] == 1
    assert mac["total"] == 1


def test_list_facets_aggregation(conn):
    entry = _seed_entry(conn)
    collections_uc.ingest(conn, entry["slug"], {"a": 1},
                          user_agent="Mozilla/5.0 (Windows NT 10.0) Chrome/120.0")
    collections_uc.ingest(conn, entry["slug"], {"a": 1},
                          user_agent="Mozilla/5.0 (Windows NT 10.0) Chrome/120.0")
    collections_uc.ingest(conn, entry["slug"], {"a": 1},
                          user_agent="Mozilla/5.0 (Macintosh) Safari/605.1")
    facets = collections_uc.list_facets(conn)
    assert facets["os"]["Windows"] == 2
    assert facets["os"]["macOS"] == 1
    assert facets["uaBrowser"]["Chrome"] == 2
