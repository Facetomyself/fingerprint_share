"""kind 分面：schema 约束、ingest 默认值与筛选、导出。"""

from __future__ import annotations

import json

import pytest

from fp_share_app.application import collections as collections_uc
from fp_share_app.application import entries as entries_uc


def _seed_entry(conn):
    return entries_uc.create_entry(conn, "DataDome-radwell.com", "js")


def test_schema_has_kind_check(conn):
    cols = {r[1]: r for r in conn.execute("PRAGMA table_info(collections)")}
    assert "kind" in cols
    # PRAGMA 列序: cid, name, type, notnull, dflt_value, pk
    assert cols["kind"][3] == 1
    assert cols["kind"][4] == "'environment'"


def test_kind_check_rejects_invalid(conn):
    entry = _seed_entry(conn)
    with pytest.raises(Exception):
        conn.execute(
            "INSERT INTO collections (entry_id, kind, collected_at, payload) VALUES (?, ?, ?, ?)",
            (entry["id"], "evil", "2026-08-14T00:00:00+00:00", "{}"),
        )


def test_ingest_default_environment(conn):
    entry = _seed_entry(conn)
    record_id = collections_uc.ingest(conn, entry["slug"], {"a": 1})
    row = conn.execute("SELECT kind FROM collections WHERE id = ?", (record_id,)).fetchone()
    assert row["kind"] == "environment"


def test_ingest_explicit_behavior(conn):
    entry = _seed_entry(conn)
    record_id = collections_uc.ingest(conn, entry["slug"], {"behavior": {}}, kind="behavior")
    row = conn.execute("SELECT kind FROM collections WHERE id = ?", (record_id,)).fetchone()
    assert row["kind"] == "behavior"


def test_list_filter_by_kind(conn):
    entry = _seed_entry(conn)
    collections_uc.ingest(conn, entry["slug"], {"a": 1})
    collections_uc.ingest(conn, entry["slug"], {"b": 2})
    collections_uc.ingest(conn, entry["slug"], {"behavior": {}}, kind="behavior")

    all_records = collections_uc.list_collections(conn)
    env_records = collections_uc.list_collections(conn, kind="environment")
    beh_records = collections_uc.list_collections(conn, kind="behavior")
    assert all_records["total"] == 3
    assert env_records["total"] == 2
    assert beh_records["total"] == 1
    assert "kind" in beh_records["items"][0]
    assert beh_records["items"][0]["kind"] == "behavior"


def test_get_collection_has_kind(conn):
    entry = _seed_entry(conn)
    record_id = collections_uc.ingest(conn, entry["slug"], {"behavior": {}}, kind="behavior")
    record = collections_uc.get_collection(conn, record_id)
    assert record["kind"] == "behavior"


def test_export_has_kind_and_filter(conn):
    entry = _seed_entry(conn)
    collections_uc.ingest(conn, entry["slug"], {"a": 1})
    collections_uc.ingest(conn, entry["slug"], {"behavior": {}}, kind="behavior")
    data = collections_uc.export_collections(conn, kind="behavior")
    assert data["count"] == 1
    assert data["records"][0]["kind"] == "behavior"
    all_data = collections_uc.export_collections(conn)
    assert all_data["count"] == 2
