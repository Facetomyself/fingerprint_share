# 页面模块契约（page-module contract）

行为指纹与页面 UI 语境绑定。平台为有行为指纹面的条目提供**条目级复刻页面模块**：
每个风控单独编写一个完整 HTML 页面，**尽可能还原原网站中的行为逻辑**（DOM 结构、
交互流程、事件时序），访问者在复刻页面上按原网站的交互方式操作，行为指纹才有研究价值。

## 渲染与注入

- 路由 `/collect/<slug>/behavior`：条目 `page_module` 非空 → 渲染模块；为空 → 通用演示页。
- `page_module` 是**完整 HTML 文档**（含 style 与行为剧本 script），后台上传。
- 平台在模块的 `</head>` 前自动注入行为采集基础层，模块作者**无需**手动引用：
  - `behavior-core.js`（12 信号纯函数核心）
  - `page-behavior.js`（事件流采集 + 剧本挂钩 + 上报）
  - 条目配置（`window.__FP_ENTRY_SLUG` / `__FP_ENTRY_NAME`）
- 模块页面 UI 由模块自身复刻；平台只加一个悬浮指示条（可经 `__fpBehavior.hideBar()` 隐藏）。

## 模块挂钩 API（window.__fpBehavior）

| 方法 | 用途 |
|---|---|
| `__fpBehavior.mark('stage-name')` | 标记剧本阶段流转（复刻流程时序研究点，随 payload 上报） |
| `__fpBehavior.submit()` | 立即提交采集（模块流程完成时调用） |
| `__fpBehavior.hideBar()` | 隐藏悬浮指示条（模块自带完整 UI 时） |
| `__fpBehavior.status()` | 查看当前采集状态（events/submitted/stages） |

## 编写要点

1. **结构复刻**：DOM 结构与原网站行为逻辑对齐（容器层级、按钮/输入框的位置与类型、
   动态出现的时机）——行为特征（鼠标轨迹、点击时序）与结构绑定。
2. **剧本时序**：用 `mark()` 记录阶段流转；用真实延时（setTimeout 800-2000ms）
   模拟原网站脚本加载与状态流转的时序。
3. **用户驱动**：流程由真实用户操作推进（点击、输入、滚动），不自动完成——
   采集的目标是用户在复刻流程中的行为。
4. **采集自动**：事件流与信号分析由平台基础层自动完成，模块只需驱动剧本与标记阶段。
5. 30s 无操作自动上报、45s 硬超时；模块可在流程完成时主动 `submit()`。
6. 模块内不得出现 `</script` 字面量以外的危险结构（平台不做沙箱，模块仅管理员本人编写）。
7. 不含外部资源引用（字体/CDN 除外慎用）；页面文本只复刻行为语义，不复制原网站版权内容。

## 提交的 payload 形态

`kind=behavior`，含 `pageContext {url, title, entrySlug, entryName, module: true}` 与
`behavior.stageMarks`（阶段名+相对时间序列）；轨迹点带元素形状（tag/class/role/inputType/id）。
