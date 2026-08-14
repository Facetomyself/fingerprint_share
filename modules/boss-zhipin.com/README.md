# BOSS-zhipin.com 插件（指纹采集模块包）

BOSS 风控（zhipin.com）的完整功能插件：采集脚本与展示页面一体化，
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
| 展示页 | `/e/boss-zhipin.com` |
| 环境采集页 | `/collect/boss-zhipin.com` |
| 行为剧本页 | `/collect/boss-zhipin.com/behavior` |
| 指纹数据 | `/e/boss-zhipin.com/fingerprints` |

## 采集了什么

BOSS 直聘 security-js 设备指纹面：WebGL readPixels 行为 / 设备指纹字段组合 / console 序列化侧信道 / 输入事件面 / 资源域名分组。来源 workspace/boss。

## 注意事项

1. 采集页面将采集你的浏览器环境/行为指纹并存储与共享，仅用于风控研究对照，
   请勿在隐私敏感环境使用。
2. 采集数据在平台内公开共享；带出平台时按 restricted-local 纪律执行：
   环境数据只允许脱敏摘要（组件名/哈希/维度计数）；行为轨迹与击键间隔原值
   一律不得输出，只允许信号判定摘要与统计值。
3. 采集脚本仅管理员本人编写维护，请勿引入第三方来源代码。
