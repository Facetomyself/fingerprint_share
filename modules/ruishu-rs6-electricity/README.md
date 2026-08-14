# 瑞数6-electricity-ruishu-web-v2 采集模块

瑞数6 风控（electricity-ruishu-web-v2）的指纹采集模块。

## 目录

- `info.html`       条目详情：采集参数清单与参数说明
- `collect.html`    环境指纹采集页：自动执行 collect.js 并上报平台
- `collect.js`      环境指纹采集脚本（可审计可复用）
- `challenge.html`  行为指纹采集页（复刻原网站行为逻辑，如有）
- `README.md`       本文件

## 平台接入

| 页面 | 平台路由 |
|---|---|
| 条目详情 | `/e/ruishu-rs6-electricity` |
| 环境指纹采集 | `/collect/ruishu-rs6-electricity` |
| 行为指纹采集 | `/collect/ruishu-rs6-electricity/behavior` |
| 指纹数据 | `/e/ruishu-rs6-electricity/fingerprints` |

## 采集参数

瑞数 6 挑战页专有环境面：$_ts 全局形状 / script 结构 / meta 与 URL 参数名结构 / cookie 键名形状 / DOM gate 原型链。来源 workspace/electricity-ruishu-web-v2。

## 使用约束

1. 采集页面将采集您的浏览器环境/行为指纹并存储至共享数据库。该数据仅用于
   风控研究对照分析，请勿在包含隐私信息的环境中访问。
2. 采集数据在本平台内公开共享。将数据带出平台时，须遵守 restricted-local
   数据分级纪律：环境数据仅允许输出脱敏摘要（组件名、哈希、维度计数）；
   行为轨迹与击键间隔原值不得输出，仅允许信号判定摘要与统计值。
3. 采集脚本由平台管理员编写与维护，请勿引入第三方来源代码。
