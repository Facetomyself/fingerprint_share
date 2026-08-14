# fingerprint_share AGENTS.md

## 项目定位

Web 环境指纹采集与共享平台。指纹数据公开共享，后台仅保护采集脚本上传管理。

## 硬约束

1. **数据纪律**：`data/`（SQLite + WAL/SHM）与任何采集记录原值不进 Git、不写入回复。平台内公开是设计意图，带出平台仍按 restricted-local 纪律（脱敏摘要）。
2. **凭据**：`.env` 只存本机（ADMIN_PASSWORD_HASH / FP_SECRET_KEY），明文密码不落盘、不回显。
3. **运行时**：只用 `D:\reverse_ENV\.venv\Scripts\python.exe`；依赖只进共享 venv，不装系统全局。
4. **采集脚本**：`collect_js/` 是种子源，后台编辑后以 DB 为准；上传脚本必须符合 `docs/collect-js-contract.md` 的 `__fp_submit` 契约。
5. **前端**：无构建步骤，vanilla HTML/JS/CSS，静态文件在 `static/`。
6. **编码**：UTF-8 + LF；不用 emoji；路径绝对化。

## 常规操作

```powershell
# 测试
& "D:\reverse_ENV\.venv\Scripts\python.exe" -m pytest "D:\reverse_ENV\workspace\fingerprint_share\tests" -v

# 启动
& "D:\reverse_ENV\.venv\Scripts\python.exe" "D:\reverse_ENV\workspace\fingerprint_share\run.py"

# 数据库只读检查
& "D:\reverse_ENV\.venv\Scripts\python.exe" -c "import sqlite3; c=sqlite3.connect(r'D:\reverse_ENV\workspace\fingerprint_share\data\fingerprint_share.db'); print([r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\")])"
```

## 修改闭环

- 改 API 路由 → 同步 README 路由说明与对应前端 JS。
- 改 DB schema → 同步 `scripts/init_db.py` 建表语句与 `tests/unit/test_db.py`。
- 改采集契约 → 同步 `docs/collect-js-contract.md`、`static/js/collector.js` 与种子脚本。
- 平台数据分级语义变化 → 同步 README「数据分级」与 `docs/data-sensitivity.md`。
