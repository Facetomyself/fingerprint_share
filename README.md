# fingerprint_share - 指纹共享平台

Web 环境指纹采集与共享平台。访问采集 URL 时在访问者浏览器执行对应条目的指纹采集 JS，结果回报平台；采集到的指纹数据对所有人开放浏览与下载（共享是核心），采集脚本的上传/编辑由后台验证保护。

参考 [fingerprintjs/fingerprintjs](https://github.com/fingerprintjs/fingerprintjs)（FingerprintJS v5，MIT 许可）的「稳定组件 + 哈希 visitorId」设计。

## 功能

| 面 | 内容 | 权限 |
|---|---|---|
| 公开导航 | 按「风控类型-网站」分组浏览条目（如 `DataDome-radwell.com`、`瑞数6-xxx`） | 所有人 |
| 条目页 | 查看说明、下载采集 JS 源码、进入指纹浏览 | 所有人 |
| 环境采集页 | `/collect/<slug>` 执行深度模板：environment 快照 32 组 + deepProbes 谎言检测（queryLies 10 接口逐项检查 / prototypeLies 40+ 接口 / phantomIframe 对比 / 双画布稳定性 / plugins-mimeTypes 交叉验证）+ trash 乱码检测 + resistance（RFP/Brave/Tor） | 所有人 |
| 行为采集页 | `/collect/<slug>/behavior` 提示模拟真实交互，采集鼠标/键盘/滚动事件流，12 项启发式信号判定 + 特征统计 + 降采样轨迹（600 点/30s） | 所有人 |
| 指纹共享 | 浏览各条目采集记录（kind 筛选、分面详情、轨迹可视化、导出 JSON） | 所有人 |
| 后台 | 采集脚本上传/编辑/删除、采集记录清理 | 管理员登录 |

## 目录

```
fp_share_app/    FastAPI 应用（config/application/infrastructure/web）
static/          无构建前端（导航/条目/指纹浏览/后台/登录）
collect_js/      采集脚本种子（后台编辑后以 DB 为准）
scripts/         init_db.py（建表+种子）/ hash_password.py（密码 hash）
data/            SQLite 数据库（含采集记录，restricted-local，不进 Git）
docs/            collect-js-contract.md / data-sensitivity.md
tests/           单元测试（pytest）
```

## 启动

```powershell
# 1. 准备 .env（管理员密码 hash + 会话密钥）
Copy-Item .env.example .env
& "D:\reverse_ENV\.venv\Scripts\python.exe" "D:\reverse_ENV\workspace\fingerprint_share\scripts\hash_password.py"
# 把输出填入 .env 的 ADMIN_PASSWORD_HASH，FP_SECRET_KEY 用任意 64 位 hex

# 2. 初始化数据库（幂等）
& "D:\reverse_ENV\.venv\Scripts\python.exe" "D:\reverse_ENV\workspace\fingerprint_share\scripts\init_db.py"

# 3. 启动
& "D:\reverse_ENV\.venv\Scripts\python.exe" "D:\reverse_ENV\workspace\fingerprint_share\run.py"
# 或：python -m uvicorn fp_share_app.main:app --app-dir "D:\reverse_ENV\workspace\fingerprint_share" --host 127.0.0.1 --port 8000
```

访问 `http://127.0.0.1:8000/`。后台 `http://127.0.0.1:8000/admin/`。

## 采集脚本契约

上传的采集 JS 只负责采集，通过平台注入的 `window.__fp_submit(payload)` 上报；不自行 fetch、不硬编码后端 URL。完整契约见 `docs/collect-js-contract.md`。

## 数据分级（重要）

- 采集记录（`data/` 下的 SQLite）在**平台运行时内公开共享**——浏览与下载是本平台设计意图。记录分 environment（环境快照+deepProbes）与 behavior（行为信号+轨迹）两类。
- **平台内公开不等于对外发布**。把指纹数据带出平台（写入报告、提交仓库、发送外部）时，按仓库 `docs/web-fingerprint-dataset.md` 的 restricted-local 纪律执行：环境数据只允许脱敏摘要（组件名、哈希、验证状态）；**行为轨迹与逐键间隔原值一律不得输出**，只允许信号判定摘要与统计值。
- `data/` 整体 gitignore；建议对 `data\` 目录收紧 Windows ACL 至当前用户。
- 长期归档可选走 `storage\datasets\web-fingerprints\generic-real\<YYYYMMDD>\` + manifest 流程。

## 安全边界

- 上传的采集 JS 在访问者浏览器执行，仅管理员本人维护使用，不做多用户与沙箱审核；不要引入第三方来源代码。
- 采集页明示「此页面将采集你的浏览器环境指纹并存储与共享」；IP 仅记录直连地址。
- 登录防爆破：固定 0.5s 延迟 + 3 次失败 30s 冷却。本机 localhost 场景适用；部署公网前需换限流方案并启用 HTTPS（`secure` cookie）。
