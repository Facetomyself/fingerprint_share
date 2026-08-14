"""FastAPI 应用组装：lifespan 建表、静态挂载、路由注册。"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .application.seed import seed_entries
from .config.settings import PROJECT_ROOT, get_settings
from .infrastructure.db import connect, init_db
from .web.routes_admin import router as admin_router
from .web.routes_public import router as public_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    conn = connect(settings.db_path)
    try:
        result = seed_entries(conn, PROJECT_ROOT)
        print(f"[fingerprint_share] db={settings.db_path} seeded={result['seeded']} "
              f"skipped_missing={result['skipped_missing']}")
    finally:
        conn.close()
    yield


app = FastAPI(title="fingerprint_share", lifespan=lifespan)

# 公开共享平台：采集上报与静态采集器允许跨域（嵌入式采集器在目标站点注入上报）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.mount("/static", StaticFiles(directory=str(PROJECT_ROOT / "static")), name="static")
app.include_router(public_router)
app.include_router(admin_router)
