# 数据分级（data sensitivity）

## 平台内共享语义

- 采集记录（`data/` SQLite）在**平台运行时内公开**：列表、详情、导出接口均无需登录。这是本平台的共享设计。
- 记录分两类 kind：`environment`（环境快照 + deepProbes 谎言检测）与 `behavior`（行为信号 + 降采样轨迹）。
- 公开面不包含：条目/记录的写操作全部需要后台登录。

## 行为数据（升级敏感度）

行为指纹记录含交互模式：鼠标轨迹点序列、键盘间隔分布、滚动模式。轨迹与击键间隔属**行为生物特征**：

- 平台内公开浏览与导出是设计意图（共享）。
- **带出平台时只允许信号判定摘要与统计值**（score/verdict/confidence/信号触发状态/速度百分位），轨迹点序列与逐键间隔原值一律不得输出、不得进 Git、不得粘贴进回复或共享文档。

## 带出平台的纪律（restricted-local）

平台内公开不等于对外发布。把指纹数据带出平台（写入报告、提交仓库、发送外部）时，按仓库 `docs/web-fingerprint-dataset.md` 的 restricted-local 纪律执行：

- 环境数据只允许脱敏摘要：组件名、哈希、维度计数、验证状态。
- 不得输出原值：Canvas data URL、WebGL UNMASKED 参数、音频波形 hash 与 UA 组合、完整 payload JSON。
- 不得提交 Git；不得粘贴进回复、issue 或共享文档。

## 存储

- `data/`（`.db` 与 `-wal`/`-shm`）整体 gitignore。
- 建议对 `data\` 目录收紧 Windows ACL 至当前用户。
- 长期归档可选：`storage\datasets\web-fingerprints\generic-real\<YYYYMMDD>\` + `manifest.json`，用 `tools\web-fingerprints\validate_dataset.py` 校验。

## 采集透明度

- 采集页横幅明示采集行为与共享用途。
- `visitor_ip` 只记录直连地址；经代理访问时该字段无归因意义。
