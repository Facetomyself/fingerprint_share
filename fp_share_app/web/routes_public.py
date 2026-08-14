"""公开路由：导航/条目/下载/采集/指纹共享/上报。全部无需登录。"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from ..application import collections as collections_uc
from ..application import entries as entries_uc
from ..config.settings import PROJECT_ROOT, get_settings
from .collect_page import render_collect_page
from .deps import get_db

router = APIRouter()

STATIC_DIR = PROJECT_ROOT / "static"

PAGE_ROUTES = {
    "/": "index.html",
    "/admin/": "admin.html",
    "/admin/login": "login.html",
}


@router.get("/")
def page_index():
    return FileResponse(STATIC_DIR / "index.html")


@router.get("/e/{slug}")
def page_entry(slug: str):
    return FileResponse(STATIC_DIR / "entry.html")


@router.get("/admin/")
def page_admin():
    return FileResponse(STATIC_DIR / "admin.html")


@router.get("/admin/login")
def page_login():
    return FileResponse(STATIC_DIR / "login.html")


@router.get("/dl/{slug}.js")
def download_collect_js(slug: str, conn: sqlite3.Connection = Depends(get_db)):
    entry = entries_uc.get_entry(conn, slug, with_js=True)
    if entry is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    filename = f"{entry['slug']}.js"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=entry["collect_js"], media_type="text/javascript; charset=utf-8", headers=headers)


@router.get("/collect/{slug}")
def page_collect(slug: str, conn: sqlite3.Connection = Depends(get_db)):
    entry = entries_uc.get_entry(conn, slug, with_js=True)
    if entry is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    return render_collect_page(entry["name"], entry["slug"], entry["collect_js"])


@router.get("/api/entries")
def api_list_entries(risk_type: str | None = None, conn: sqlite3.Connection = Depends(get_db)):
    return entries_uc.list_entries(conn, with_js=False, risk_type=risk_type)


@router.get("/api/entries/{slug}")
def api_get_entry(slug: str, conn: sqlite3.Connection = Depends(get_db)):
    entry = entries_uc.get_entry(conn, slug, with_js=False)
    if entry is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    return entry


@router.post("/api/ingest")
async def api_ingest(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    """采集上报。手动读 body 以实施字节级大小上限。"""
    settings = get_settings()
    body = await request.body()
    if len(body) > settings.ingest_max_bytes:
        raise HTTPException(status_code=413, detail=f"payload 超过 {settings.ingest_max_bytes} 字节上限")
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="请求体必须是合法 JSON")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="请求体必须是 JSON 对象")
    entry_slug = data.get("entry_slug")
    payload = data.get("payload")
    if not isinstance(entry_slug, str) or not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="entry_slug 与 payload（对象）必填")
    summary = data.get("summary")
    duration_ms = data.get("duration_ms")
    if duration_ms is not None and not isinstance(duration_ms, int):
        raise HTTPException(status_code=422, detail="duration_ms 必须是整数")

    record_id = collections_uc.ingest(
        conn,
        entry_slug,
        payload,
        summary=summary,
        duration_ms=duration_ms,
        visitor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    if record_id is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    return {"ok": True, "id": record_id}


@router.get("/api/collections")
def api_list_collections(entry_id: int | None = None, page: int = 1,
                         conn: sqlite3.Connection = Depends(get_db)):
    if page < 1:
        page = 1
    return collections_uc.list_collections(conn, entry_id=entry_id, page=page)


@router.get("/api/collections/{collection_id}")
def api_get_collection(collection_id: int, conn: sqlite3.Connection = Depends(get_db)):
    record = collections_uc.get_collection(conn, collection_id)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@router.get("/api/export")
def api_export(entry_id: int | None = None, conn: sqlite3.Connection = Depends(get_db)):
    data = collections_uc.export_collections(conn, entry_id=entry_id)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"fingerprints-{stamp}.json"
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
