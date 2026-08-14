"""schema 建表与 CRUD/CASCADE 行为。"""

from __future__ import annotations

from fp_share_app.application import collections as collections_uc
from fp_share_app.application import entries as entries_uc


def test_schema_tables_exist(conn):
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"entries", "collections"} <= tables


def test_create_and_get_entry(conn):
    entry = entries_uc.create_entry(conn, "DataDome-radwell.com", "console.log('fp');",
                                    description="测试条目")
    assert entry["slug"] == "datadome-radwell.com"
    assert entry["risk_type"] == "DataDome"
    assert entry["website"] == "radwell.com"
    assert entry["collect_js"] == "console.log('fp');"

    fetched = entries_uc.get_entry(conn, entry["slug"], with_js=True)
    assert fetched["name"] == "DataDome-radwell.com"

    listed = entries_uc.list_entries(conn, with_js=False)
    assert len(listed) == 1
    assert "collect_js" not in listed[0]


def test_slug_conflict_suffix(conn):
    first = entries_uc.create_entry(conn, "Akamai-test.com", "js1")
    second = entries_uc.create_entry(conn, "akamai-test.com", "js2")
    assert first["slug"] == "akamai-test.com"
    assert second["slug"] == "akamai-test.com-2"


def test_chinese_name_slug_fallback(conn):
    entry = entries_uc.create_entry(conn, "瑞数6-某站", "js3")
    assert entry["slug"] == f"entry-{entry['id']}"
    assert entry["risk_type"] == "瑞数6"
    assert entry["website"] == "某站"


def test_update_entry_partial(conn):
    entry = entries_uc.create_entry(conn, "CF-challenge.example", "js-a")
    updated = entries_uc.update_entry(conn, entry["slug"], description="新描述", version="v2")
    assert updated["description"] == "新描述"
    assert updated["version"] == "v2"
    assert updated["collect_js"] == "js-a"
    assert updated["name"] == "CF-challenge.example"

    renamed = entries_uc.update_entry(conn, entry["slug"], name="Cloudflare-challenge.example")
    assert renamed["risk_type"] == "Cloudflare"
    assert renamed["website"] == "challenge.example"


def test_delete_entry_cascades_collections(conn):
    entry = entries_uc.create_entry(conn, "DataDome-x.com", "js")
    collections_uc.ingest(conn, entry["slug"], {"visitorId": "abc"})
    assert conn.execute("SELECT COUNT(*) FROM collections").fetchone()[0] == 1

    assert entries_uc.delete_entry(conn, entry["slug"]) is True
    assert conn.execute("SELECT COUNT(*) FROM collections").fetchone()[0] == 0
    assert entries_uc.delete_entry(conn, entry["slug"]) is False


def test_has_behavior_default_and_update(conn):
    entry = entries_uc.create_entry(conn, "DataDome-x.com", "js")
    assert entry["has_behavior"] == 1

    no_behavior = entries_uc.create_entry(conn, "Imperva-y.com", "js", has_behavior=0)
    assert no_behavior["has_behavior"] == 0

    updated = entries_uc.update_entry(conn, entry["slug"], has_behavior=0)
    assert updated["has_behavior"] == 0
    assert entries_uc.get_entry(conn, entry["slug"], with_js=False)["has_behavior"] == 0
