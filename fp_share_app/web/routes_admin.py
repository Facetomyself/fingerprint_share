"""后台路由：全部 admin_required，仅保护采集脚本管理与记录清理。"""

from __future__ import annotations

import asyncio
import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..application import collections as collections_uc
from ..application import entries as entries_uc
from ..application.auth import (
    admin_required,
    check_brute_block,
    clear_login_failures,
    record_login_failure,
    verify_password,
)
from ..application.entries import NameValidationError
from ..config.settings import get_settings
from ..infrastructure.session_store import create_serializer, sign_session
from .deps import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class EntryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    collect_js: str = Field(min_length=1, max_length=1024 * 1024)
    description: str = ""
    version: str = "v1"
    has_behavior: int = Field(default=1, ge=0, le=1)


class EntryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    collect_js: str | None = Field(default=None, min_length=1, max_length=1024 * 1024)
    description: str | None = None
    version: str | None = None
    has_behavior: int | None = Field(default=None, ge=0, le=1)


def _set_session_cookie(response: JSONResponse) -> None:
    settings = get_settings()
    serializer = create_serializer(settings.secret_key)
    response.set_cookie(
        settings.session_cookie,
        sign_session(serializer),
        max_age=settings.session_max_age,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


@router.post("/api/admin/login")
async def api_login(request: Request, body: LoginRequest):
    settings = get_settings()
    if not settings.is_configured:
        raise HTTPException(status_code=503, detail="服务未配置：.env 缺少 ADMIN_PASSWORD_HASH / FP_SECRET_KEY")
    ip = request.client.host if request.client else "unknown"
    if check_brute_block(ip):
        raise HTTPException(status_code=429, detail="失败次数过多，请 30 秒后重试")
    await asyncio.sleep(0.5)  # 固定延迟，拉平成功/失败耗时
    if verify_password(body.password, settings.admin_password_hash):
        clear_login_failures(ip)
        response = JSONResponse({"ok": True})
        _set_session_cookie(response)
        return response
    record_login_failure(ip)
    raise HTTPException(status_code=401, detail="密码错误")


@router.post("/api/admin/logout")
def api_logout(_: bool = Depends(admin_required)):
    settings = get_settings()
    response = JSONResponse({"ok": True})
    response.delete_cookie(settings.session_cookie, path="/")
    return response


@router.get("/api/admin/me")
def api_me(_: bool = Depends(admin_required)):
    return {"ok": True}


@router.get("/api/admin/entries")
def api_admin_list_entries(_: bool = Depends(admin_required),
                           conn: sqlite3.Connection = Depends(get_db)):
    return entries_uc.list_entries(conn, with_js=True)


@router.post("/api/admin/entries")
def api_admin_create_entry(body: EntryCreate, _: bool = Depends(admin_required),
                           conn: sqlite3.Connection = Depends(get_db)):
    try:
        entry = entries_uc.create_entry(
            conn, body.name, body.collect_js,
            description=body.description, version=body.version,
            has_behavior=body.has_behavior,
        )
    except NameValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return entry


@router.put("/api/admin/entries/{slug}")
def api_admin_update_entry(slug: str, body: EntryUpdate, _: bool = Depends(admin_required),
                           conn: sqlite3.Connection = Depends(get_db)):
    try:
        entry = entries_uc.update_entry(
            conn, slug,
            name=body.name, collect_js=body.collect_js,
            description=body.description, version=body.version,
            has_behavior=body.has_behavior,
        )
    except NameValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if entry is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    return entry


@router.delete("/api/admin/entries/{slug}")
def api_admin_delete_entry(slug: str, _: bool = Depends(admin_required),
                           conn: sqlite3.Connection = Depends(get_db)):
    if not entries_uc.delete_entry(conn, slug):
        raise HTTPException(status_code=404, detail="条目不存在")
    return {"ok": True}


@router.delete("/api/admin/collections/{collection_id}")
def api_admin_delete_collection(collection_id: int, _: bool = Depends(admin_required),
                                conn: sqlite3.Connection = Depends(get_db)):
    if not collections_uc.delete_collection(conn, collection_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"ok": True}
