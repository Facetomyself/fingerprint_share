# DataDome-radwell.com 指纹采集插件

DataDome 风控（radwell.com）的完整浏览器插件：采集脚本、展示页面与行为剧本一体化。

## 安装

1. Firefox：`about:debugging` → 临时载入附加组件 → 选择本目录 `manifest.json`
   （或 Chromium：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序）
2. 点击工具栏插件图标打开展示页

## 采集了什么

DataDome tags.js 5.9.0 专有探测面：dd 全局形状 / eventCounters 计数结构 / cid 形状生成 / request envelope 输入面 / defineProperty 可覆写性 / storage dd 键名。来源 workspace/radwell（jspl 九字段 envelope 研究）。

## 怎么使用

1. 点击插件图标 → 「打开环境采集页」：执行环境指纹采集，自动上报平台
2. 「打开行为剧本页」（如有）：在复刻原网站行为逻辑的页面上按真实交互方式操作，
   30s 自动上报或手动提交
3. 采集结果在平台指纹页浏览与下载：http://106.15.239.221:8000/e/datadome-radwell.com/fingerprints

## 注意事项

1. 采集页面将采集浏览器环境/行为指纹并存储与共享，仅用于风控研究对照，
   请勿在隐私敏感环境使用
2. 采集数据在平台内公开共享；带出平台时按 restricted-local 纪律：
   环境数据只允许脱敏摘要；行为轨迹与击键间隔原值一律不得输出
3. 采集脚本仅管理员本人编写维护，请勿引入第三方来源代码
4. 平台地址与上报桥配置在 `collector.js` / `challenge-bridge.js` 顶部
   PLATFORM 常量（默认 http://106.15.239.221:8000）
