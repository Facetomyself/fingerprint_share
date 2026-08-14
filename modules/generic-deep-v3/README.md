# 通用-deep-fingerprint-v3 插件（指纹采集模块包）

通用 风控（deep-fingerprint-v3）的完整功能插件：采集脚本与展示页面一体化，
集成在平台 Web 体系内（非浏览器扩展）。

## 目录

- `info.html`       展示页：采集了什么 / 怎么使用 / 注意事项
- `collect.html`    环境采集页：自动执行 collect.js 并上报平台
- `collect.js`      环境采集脚本（可审计可复用）
- `challenge.html`  行为剧本页（复刻原网站行为逻辑，如有）
- `README.md`       本文件

## 平台接入

| 页面 | 平台路由 |
|---|---|
| 展示页 | `/e/generic-deep-v3` |
| 环境采集页 | `/collect/generic-deep-v3` |
| 行为剧本页 | `/collect/generic-deep-v3/behavior` |
| 指纹数据 | `/e/generic-deep-v3/fingerprints` |

## 采集了什么

深度浏览器指纹基线 v3：environment 快照 32 组 + deepProbes 谎言检测三层（queryLies 10 接口 ~20 项检查 / prototypeLies 40+ 接口递归 / phantomIframe 对比 / 双画布稳定性 / plugins-mimeTypes 交叉验证）+ trash 乱码检测 + resistance（timer precision/RFP/Brave/Tor/扩展哈希）。行为指纹走独立行为采集页。机制参考 CreepJS (MIT)，自写实现。

## 注意事项

1. 采集页面将采集您的浏览器环境/行为指纹并存储至共享数据库。该数据仅用于
   风控研究对照分析，请勿在包含隐私信息的环境中访问。
2. 采集数据在本平台内公开共享。将数据带出平台时，须遵守 restricted-local
   数据分级纪律：环境数据仅允许输出脱敏摘要（组件名、哈希、维度计数）；
   行为轨迹与击键间隔原值不得输出，仅允许信号判定摘要与统计值。
3. 采集脚本由平台管理员编写与维护，请勿引入第三方来源代码。
