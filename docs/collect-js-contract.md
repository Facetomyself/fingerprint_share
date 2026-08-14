# 采集脚本契约（collect-js contract）

上传到平台的采集 JS 在访问者浏览器内联执行，平台负责上报与状态展示。

## 执行模型

采集页 `/collect/<slug>` 按以下顺序输出：

1. 声明横幅（此页面将采集你的浏览器环境指纹并存储与共享）
2. `<script src="/static/js/collector.js">` —— 平台侧执行器
3. 内联 `<script>` —— 条目 `collect_js` 源码（渲染时 `</script` 字面量被转义防闭合）

## __fp_submit 契约

- 平台注入全局函数 `window.__fp_submit(payload)`。
- 上传脚本**只采集**，最终必须调用一次 `__fp_submit(payload)`；禁止脚本内自行 `fetch` 上报、禁止硬编码后端 URL。
- `payload` 必须是 JSON-safe 对象，整体上报上限 512 KiB。
- 页面 15 秒内未收到提交会显示超时提示（兜底）。
- 提交成功后页面展示 visitorId、维度数、耗时摘要。

## payload 结构约定

### environment 面（环境采集页，模板 generic-deep-v3 产出）

```json
{
  "script": "generic-deep-v3",
  "kind": "environment",
  "collectedAt": "2026-08-14T00:00:00.000Z",
  "visitorId": "<sha256 hex，稳定子集哈希，内部对照用>",
  "components": { "<32 组快照>": "值或 null" },
  "deepProbes": {
    "lies": {
      "queryLies": { "totalChecked": 0, "interfaces": { "<接口名>": { "checked": 0, "failures": [] } } },
      "prototypeLies": { "checkedInterfaces": 0, "interfaces": [], "anomalies": [], "extensionHashMatch": null },
      "phantomIframe": { "compared": 0, "diff": [] },
      "stability": { "canvasSameElement": {}, "canvasRecreated": {}, "mathCases": [], "mathPass": true, "audioStable": true },
      "crossValidation": { "pass": true, "issues": [], "counts": {} }
    },
    "trash": { "checks": [], "rendererGrade": "A|C|F" },
    "resistance": {
      "timerPrecision": { "allSame": false, "digits": [] },
      "brave": false, "rfpIndicators": {}, "rfpScore": 0,
      "torIndicators": {}, "torScore": 0
    }
  },
  "errors": ["<维度名>:<错误类型>"],
  "durationMs": 123
}
```

- 每个维度独立 try-catch，失败置 `null` 并记入 `errors`；单维度失败不阻断整体提交。
- queryLies 只存失败项（正常浏览器几乎为空）；prototypeLies 的 anomalies 截断 50 条。
- Canvas / Audio / Emoji 类维度只存哈希，不存原始 data URL 或音频样本。
- `visitorId` 由稳定子集哈希得出，是平台内部对照标识，**不是**稳定唯一设备 ID。

### behavior 面（行为采集页，平台内置行为采集器产出）

```json
{
  "script": "behavior-collector-v1",
  "kind": "behavior",
  "collectedAt": "2026-08-14T00:00:00.000Z",
  "behavior": {
    "session": { "durationMs": 30000, "eventCounts": { "mousemove": 0, "keydown": 0, "wheel": 0, "click": 0, "touch": 0 } },
    "signals": [ { "id": "linear-typing", "weight": 0.35, "confidence": "high", "triggered": false, "detail": "cv=0.31" } ],
    "score": 0.0,
    "verdict": "legit|suspicious",
    "confidence": "low|medium|high",
    "stats": { "speedPercentiles": {}, "intervalHistogram": [], "directionTurns": 0, "scrollDelta": {}, "keyIntervalMs": {} },
    "trajectory": { "totalEvents": 0, "sampled": 0, "durationMs": 0, "points": [ { "t": 0, "x": 0, "y": 0, "ty": "m|k|w|c|t" } ] }
  },
  "errors": [],
  "durationMs": 30042
}
```

- 行为采集由平台内置采集器执行（`static/js/behavior-core.js` + `behavior.js`），条目脚本不参与。
- 轨迹降采样上限 600 点、会话时长上限 60s（服务端双重校验，超限 422）。
- 行为页明示「请模拟真实交互」，首次事件起 30s 自动提交，手动提交至少观察 3s。

## 限制

- 脚本内不得出现 `</script` 字面量（会被平台转义；如必须，写为 `<\/script`）；emoji 用 `\u` 转义。
- 异步维度需自设超时（参考模板 3-6s）；禁止无限等待。
- 不引入第三方来源代码；上传即自担在访问者浏览器执行的风险。
