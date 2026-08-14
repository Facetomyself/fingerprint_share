# 数据分级（data sensitivity）

## 平台内共享语义

- 采集记录（`data/` SQLite）在**平台运行时内公开**：列表、详情、导出接口均无需登录。这是本平台的共享设计。
- 公开面不包含：采集脚本源码（走 `/dl/<slug>.js` 下载与 `/e/<slug>` 页面，可公开浏览）之外的任何管理能力；条目/记录的写操作全部需要后台登录。

## 带出平台的纪律（restricted-local）

平台内公开不等于对外发布。把指纹数据带出平台（写入报告、提交仓库、发送外部）时，按仓库 `docs/web-fingerprint-dataset.md` 的 restricted-local 纪律执行：

- 只允许脱敏摘要：组件名、哈希、维度计数、验证状态。
- 不得输出原值：Canvas data URL、WebGL UNMASKED 参数、音频波形 hash 与 UA 组合、完整 payload JSON。
- 不得提交 Git；不得粘贴进回复、issue 或共享文档。

## 存储

- `data/`（`.db` 与 `-wal`/`-shm`）整体 gitignore。
- 建议对 `data\` 目录收紧 Windows ACL 至当前用户。
- 长期归档可选：`storage\datasets\web-fingerprints\generic-real\<YYYYMMDD>\` + `manifest.json`，用 `tools\web-fingerprints\validate_dataset.py` 校验。

## 采集透明度

- 采集页横幅明示采集行为与共享用途。
- `visitor_ip` 只记录直连地址；经代理访问时该字段无归因意义。
