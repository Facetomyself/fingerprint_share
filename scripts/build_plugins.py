"""生成每个风控的完整浏览器插件（WebExtension MV3）。

每个插件自包含：manifest + popup 展示页（采集了什么/怎么使用/注意事项）
+ 环境采集页（内联采集脚本 + 上报桥）+ 行为剧本页（复刻原网站行为逻辑）
+ 采集基础层副本（behavior-core）+ README。

输入：collect_js/（采集脚本）、page_modules/（行为剧本页）、seed 元数据。
输出：plugins/<slug>/。

用法：
  D:\\reverse_ENV\\.venv\\Scripts\\python.exe scripts\\build_plugins.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fp_share_app.application.seed import SEED_ENTRIES  # noqa: E402

PLUGINS_DIR = PROJECT_ROOT / "plugins"
COLLECT_JS_DIR = PROJECT_ROOT / "collect_js"
PAGE_MODULES_DIR = PROJECT_ROOT / "page_modules"
STATIC_JS_DIR = PROJECT_ROOT / "static" / "js"

DEFAULT_PLATFORM = "http://106.15.239.221:8000"

NOTICE_TEXT = """注意事项：
1. 本插件页面将采集浏览器环境/行为指纹并存储与共享，仅用于风控研究对照，
   请勿在隐私敏感环境使用。
2. 采集数据在平台内公开共享；带出平台时按 restricted-local 纪律执行：
   环境数据只允许脱敏摘要；行为轨迹与击键间隔原值一律不得输出。
3. 采集脚本仅管理员本人编写维护，请勿引入第三方来源代码。"""

MANIFEST_TEMPLATE = """{
  "manifest_version": 3,
  "name": "__NAME__ 指纹采集插件",
  "version": "1.0",
  "description": "__DESC_SHORT__",
  "action": {
    "default_popup": "popup.html",
    "default_title": "__NAME__"
  },
  "permissions": ["storage", "tabs"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "browser_specific_settings": {
    "gecko": {
      "id": "fp-__SLUG__@fingerprint-share.local"
    }
  }
}
"""

POPUP_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>__NAME__</title>
<style>
  body {{ margin: 0; width: 340px; font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
    background: #0b0b12; color: #e8e8ec; font-size: 13px; }}
  .hd {{ padding: 16px 18px 12px; background: rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.08); }}
  .hd h1 {{ margin: 0; font-size: 16px; letter-spacing: -0.01em; }}
  .hd p {{ margin: 4px 0 0; font-size: 11.5px; color: #8f8f9c; }}
  .bd {{ padding: 12px 18px 16px; }}
  .bd h2 {{ font-size: 12px; color: #8f8f9c; text-transform: uppercase; letter-spacing: 0.08em; margin: 14px 0 6px; }}
  .bd p {{ margin: 4px 0; line-height: 1.55; color: #b8b8c6; }}
  .bd ul {{ margin: 4px 0; padding-left: 18px; color: #b8b8c6; line-height: 1.6; }}
  button {{ display: block; width: 100%; margin: 8px 0; padding: 9px 14px; border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.07); color: #fff;
    font-size: 13px; cursor: pointer; text-align: left; }}
  button:hover {{ background: rgba(255,255,255,0.12); }}
  button.primary {{ background: rgba(10,132,255,0.85); border-color: rgba(10,132,255,0.6); }}
  .badge {{ display: inline-block; border-radius: 999px; padding: 1px 9px; font-size: 11px;
    background: rgba(48,209,88,0.15); color: #4cd964; border: 1px solid rgba(48,209,88,0.3); margin-left: 6px; }}
</style>
</head>
<body>
<div class="hd">
  <h1>__NAME__<span class="badge">__HAS_BEHAVIOR__</span></h1>
  <p>__RISK_TYPE__ · __WEBSITE__</p>
</div>
<div class="bd">
  <h2>采集了什么</h2>
  <p>__DESCRIPTION__</p>
  <h2>怎么使用</h2>
  <ul>
    <li>点击下方「打开环境采集页」执行环境指纹采集（自动上报平台）。</li>
    __BEHAVIOR_STEP__
    <li>采集结果在平台指纹页浏览与下载（平台地址见插件 README）。</li>
  </ul>
  <h2>注意事项</h2>
  <p>__NOTICE__</p>
  <button class="primary" id="btn-collect">打开环境采集页</button>
  __BEHAVIOR_BUTTON__
  <button id="btn-readme">打开 README（使用说明）</button>
</div>
<script src="popup.js"></script>
</body>
</html>
"""

POPUP_JS_TEMPLATE = """/* popup：打开插件内采集页/剧本页 */
(function () {
  'use strict';
  var SLUG = '__SLUG__';
  function openPage(name) {
    chrome.tabs.create({ url: chrome.runtime.getURL(name) });
  }
  document.getElementById('btn-collect').addEventListener('click', function () {
    openPage('collect.html');
  });
  var btnChallenge = document.getElementById('btn-challenge');
  if (btnChallenge) {
    btnChallenge.addEventListener('click', function () {
      openPage('challenge.html');
    });
  }
  document.getElementById('btn-readme').addEventListener('click', function () {
    openPage('README.md');
  });
})();
"""

COLLECT_PAGE_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>环境指纹采集 - __NAME__</title>
<style>
  body {{ margin: 0; padding: 24px; font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
    background: #0b0b12; color: #e8e8ec; }}
  h1 {{ font-size: 20px; margin: 0 0 6px; }}
  .muted {{ color: #8f8f9c; font-size: 12.5px; }}
  #fp-status {{ margin: 16px 0; padding: 12px 16px; border-radius: 10px;
    background: rgba(10,132,255,0.10); border: 1px solid rgba(10,132,255,0.3); font-size: 13.5px; }}
  #fp-status.ok {{ background: rgba(48,209,88,0.10); border-color: rgba(48,209,88,0.32); }}
  #fp-status.error {{ background: rgba(255,69,58,0.10); border-color: rgba(255,69,58,0.34); }}
</style>
</head>
<body>
<h1>__NAME__</h1>
<p class="muted">此页面将采集你的浏览器环境指纹并存储与共享。仅用于风控研究对照。</p>
<div id="fp-status">正在采集环境指纹...</div>
<script src="collector.js"></script>
<script>
__COLLECT_JS__
</script>
</body>
</html>
"""

COLLECTOR_JS_TEMPLATE = """/* 插件内上报桥：平台注入 window.__fp_submit(payload) */
(function () {
  'use strict';
  var PLATFORM = '__PLATFORM__';
  var SLUG = '__SLUG__';
  var submitted = false;
  var statusEl = document.getElementById('fp-status');

  function setStatus(text, cls) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.className = cls || '';
    }
  }

  window.__fp_submit = function (payload) {
    if (submitted) { return; }
    submitted = true;
    fetch(PLATFORM + '/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: SLUG,
        kind: 'environment',
        payload: payload,
        summary: {
          script: payload && payload.script ? payload.script : null,
          visitorId: payload && payload.visitorId ? payload.visitorId : null,
          dimensions: payload && payload.components
            ? Object.keys(payload.components).filter(function (k) { return payload.components[k] !== null; }).length : 0,
          errors: payload && payload.errors ? payload.errors : []
        },
        duration_ms: payload && typeof payload.durationMs === 'number' ? payload.durationMs : null
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, status: resp.status, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        setStatus('采集完成并已上报：visitorId=' + ((payload && payload.visitorId) || '-').slice(0, 24) +
          '...，耗时=' + ((payload && payload.durationMs) || 0) + 'ms', 'fp-status ok');
      } else {
        setStatus('上报失败：' + ((r.data && r.data.detail) || ('HTTP ' + r.status)), 'fp-status error');
      }
    }).catch(function (e) {
      setStatus('上报失败：' + e.message, 'fp-status error');
    });
  };
})();
"""

CHALLENGE_BRIDGE_TEMPLATE = """<script src="behavior-core.js"></script>
<script src="challenge-bridge.js"></script>
"""

CHALLENGE_BRIDGE_JS_TEMPLATE = """/* 行为剧本页采集桥：事件流 + 上报（kind=behavior，含 pageContext） */
(function () {
  'use strict';
  var PLATFORM = '__PLATFORM__';
  var SLUG = '__SLUG__';
  var core = window.behaviorCore;
  if (!core) { return; }
  var buffer = core.createBuffer();
  var t0 = performance.now();
  var firstEventT = null;
  var submitted = false;
  var stageMarks = [];
  var AUTO_MS = 30000;
  var MIN_OBSERVE_MS = 3000;

  function elapsed() { return firstEventT === null ? 0 : performance.now() - firstEventT; }

  function emit(ty, extra) {
    if (submitted) { return; }
    var ev = { t: performance.now() - t0, ty: ty };
    if (extra) { Object.keys(extra).forEach(function (k) { ev[k] = extra[k]; }); }
    if (firstEventT === null) {
      firstEventT = performance.now();
      setTimeout(function () { if (!submitted && elapsed() >= AUTO_MS) { submit(); } }, AUTO_MS);
    }
    core.pushEvent(buffer, ev);
    updateBar();
  }

  function elementShape(target) {
    if (!target || !target.tagName) { return null; }
    var shape = { tag: target.tagName.toLowerCase() };
    try {
      if (target.className && typeof target.className === 'string') {
        shape.cls = target.className.split(/\\s+/).slice(0, 2).join(' ');
      }
      if (target.id && target.id.length < 60) { shape.id = target.id; }
    } catch (e) { /* 忽略 */ }
    return shape;
  }

  document.addEventListener('mousemove', function (e) {
    emit('m', { x: e.clientX, y: e.clientY, dx: e.movementX || 0, dy: e.movementY || 0,
      px: e.pageX, sx: e.screenX, isTrusted: e.isTrusted });
  }, { passive: true });
  document.addEventListener('wheel', function (e) {
    emit('w', { deltaY: e.deltaY, isTrusted: e.isTrusted });
  }, { passive: true });
  document.addEventListener('keydown', function (e) {
    emit('k', { keyLen: e.key ? e.key.length : 0, repeat: !!e.repeat,
      isTrusted: e.isTrusted, el: elementShape(e.target) });
  });
  document.addEventListener('click', function (e) {
    emit('c', { x: e.clientX, y: e.clientY, px: e.pageX, sx: e.screenX,
      clickDetail: e.detail || 0, isTrusted: e.isTrusted, el: elementShape(e.target) });
  });

  // 悬浮指示条
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;' +
    'background:rgba(20,20,30,0.86);color:#f5f5f7;font:12px sans-serif;border-radius:12px;' +
    'border:1px solid rgba(255,255,255,0.12);padding:10px 12px;display:flex;gap:8px;align-items:center;';
  var label = document.createElement('span');
  label.textContent = '行为采集: 0 事件';
  label.style.color = '#b6b6c2';
  var submitBtn = document.createElement('button');
  submitBtn.textContent = '提交';
  submitBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.16);' +
    'color:#fff;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;';
  submitBtn.disabled = true;
  submitBtn.onclick = function () { submit(); };
  bar.appendChild(label);
  bar.appendChild(submitBtn);
  function mountBar() {
    if (document.body) { document.body.appendChild(bar); } else { setTimeout(mountBar, 50); }
  }
  mountBar();

  function updateBar() {
    if (submitted) { return; }
    var remain = firstEventT === null ? '' : ' · 剩 ' + Math.max(0, Math.round((AUTO_MS - elapsed()) / 1000)) + 's';
    label.textContent = '行为采集: ' + buffer.events.length + ' 事件' + remain +
      (stageMarks.length ? ' · ' + stageMarks[stageMarks.length - 1].name : '');
    submitBtn.disabled = firstEventT === null || elapsed() < MIN_OBSERVE_MS;
  }

  function submit(force) {
    if (submitted) { return; }
    if (firstEventT === null) { return; }
    if (!force && elapsed() < MIN_OBSERVE_MS) { return; }
    submitted = true;
    label.textContent = '上报中...';
    var events = buffer.events;
    var analysis = core.analyze(events);
    var stats = core.computeStats(events);
    var trajectory = core.buildTrajectory(events, 600);
    var payload = {
      script: 'plugin-behavior-v1',
      kind: 'behavior',
      collectedAt: new Date().toISOString(),
      pageContext: {
        url: location.href.slice(0, 800),
        title: (document.title || '').slice(0, 200),
        entrySlug: SLUG,
        module: true
      },
      behavior: {
        session: { durationMs: Math.round(elapsed()), eventCounts: core.eventCounts(events) },
        stageMarks: stageMarks.slice(0, 60),
        signals: analysis.signals,
        score: analysis.score,
        verdict: analysis.verdict,
        confidence: analysis.confidence,
        stats: stats,
        trajectory: trajectory
      },
      errors: [],
      durationMs: Math.round(performance.now() - t0)
    };
    fetch(PLATFORM + '/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: SLUG, kind: 'behavior', payload: payload,
        summary: { script: 'plugin-behavior-v1', score: analysis.score, verdict: analysis.verdict,
          dimensions: payload.behavior.session.eventCounts },
        duration_ms: payload.durationMs
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        label.textContent = '已上报: score=' + analysis.score + ' ' + analysis.verdict;
        submitBtn.disabled = true;
      } else {
        label.textContent = '上报失败: ' + ((r.data && r.data.detail) || 'error');
        submitted = false;
      }
    }).catch(function (e) {
      label.textContent = '上报失败: ' + e.message;
      submitted = false;
    });
  }

  window.__fpBehavior = {
    mark: function (name) {
      if (submitted) { return; }
      stageMarks.push({ name: String(name).slice(0, 60), t: Math.round(elapsed()) });
      updateBar();
    },
    submit: function () { submit(true); },
    hideBar: function () { if (bar.parentNode) { bar.parentNode.removeChild(bar); } }
  };

  updateBar();
  setInterval(updateBar, 1000);
})();
"""

GENERIC_CHALLENGE_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>行为采集 - __NAME__</title>
<style>
  body {{ margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
    background: linear-gradient(160deg, #0e0e18 0%, #171722 100%); color: #e8e8ec; }}
  .card {{ width: 100%; max-width: 420px; padding: 26px 28px; border-radius: 16px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10); }}
  h1 {{ font-size: 18px; margin: 0 0 6px; }}
  .muted {{ color: #8f8f9c; font-size: 12.5px; margin: 0 0 16px; }}
  input {{ width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14);
    background: rgba(0,0,0,0.3); color: #fff; font-size: 14px; outline: none; }}
  button {{ display: block; width: 100%; margin-top: 12px; padding: 11px 16px; border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.07); color: #fff;
    font-size: 14px; cursor: pointer; }}
  button:hover {{ background: rgba(255,255,255,0.12); }}
  .tall {{ min-height: 200px; }}
</style>
</head>
<body>
<div class="card">
  <h1>__NAME__ · 行为采集</h1>
  <p class="muted">请模拟真实交互：移动鼠标、在输入框中打字、滚动页面。30 秒后自动上报。</p>
  <input id="demo-input" placeholder="在这里打一段文字（示例）" autocomplete="off">
  <button id="demo-btn">示例按钮（点击）</button>
  <div class="tall"></div>
  <p class="muted" id="hint">事件计数见右上角悬浮条；可手动提交。</p>
</div>
<script src="behavior-core.js"></script>
<script src="challenge-bridge.js"></script>
</body>
</html>
"""

README_TEMPLATE = """# __NAME__ 指纹采集插件

__RISK_TYPE__ 风控（__WEBSITE__）的完整浏览器插件：采集脚本、展示页面与行为剧本一体化。

## 安装

1. Firefox：`about:debugging` → 临时载入附加组件 → 选择本目录 `manifest.json`
   （或 Chromium：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序）
2. 点击工具栏插件图标打开展示页

## 采集了什么

__DESCRIPTION__

## 怎么使用

1. 点击插件图标 → 「打开环境采集页」：执行环境指纹采集，自动上报平台
2. 「打开行为剧本页」（如有）：在复刻原网站行为逻辑的页面上按真实交互方式操作，
   30s 自动上报或手动提交
3. 采集结果在平台指纹页浏览与下载：__PLATFORM__/e/__SLUG__/fingerprints

## 注意事项

1. 采集页面将采集浏览器环境/行为指纹并存储与共享，仅用于风控研究对照，
   请勿在隐私敏感环境使用
2. 采集数据在平台内公开共享；带出平台时按 restricted-local 纪律：
   环境数据只允许脱敏摘要；行为轨迹与击键间隔原值一律不得输出
3. 采集脚本仅管理员本人编写维护，请勿引入第三方来源代码
4. 平台地址与上报桥配置在 `collector.js` / `challenge-bridge.js` 顶部
   PLATFORM 常量（默认 __PLATFORM__）
"""


def render_template(template: str, values: dict) -> str:
    for key, value in values.items():
        template = template.replace(f"__{key}__", str(value))
    return template


def build_plugin(spec: dict) -> dict:
    slug = spec["slug"]
    name = spec["name"]
    risk_type, _, website = name.partition("-")
    has_behavior = spec.get("has_behavior", 1)
    module_file = spec.get("page_module_file")
    out_dir = PLUGINS_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    desc_short = spec["description"][:90].replace("\n", " ")
    values = {
        "SLUG": slug, "NAME": name, "RISK_TYPE": risk_type, "WEBSITE": website,
        "DESCRIPTION": spec["description"], "DESC_SHORT": desc_short,
        "PLATFORM": DEFAULT_PLATFORM,
        "HAS_BEHAVIOR": "含行为剧本" if has_behavior else "仅环境面",
        "NOTICE": NOTICE_TEXT,
    }

    # manifest
    (out_dir / "manifest.json").write_text(
        json.dumps(json.loads(render_template(MANIFEST_TEMPLATE, values)),
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # popup 展示页
    behavior_step = ""
    behavior_button = ""
    if has_behavior:
        behavior_step = ("    <li>「打开行为剧本页」：在复刻原网站行为逻辑的页面上"
                         "按真实交互方式操作（剧本阶段自动记录）。</li>")
        behavior_button = ('  <button id="btn-challenge">打开行为剧本页</button>\n')
    values["BEHAVIOR_STEP"] = behavior_step
    values["BEHAVIOR_BUTTON"] = behavior_button
    (out_dir / "popup.html").write_text(
        render_template(POPUP_TEMPLATE, values), encoding="utf-8")
    (out_dir / "popup.js").write_text(
        render_template(POPUP_JS_TEMPLATE, values), encoding="utf-8")

    # 环境采集页（内联采集脚本 + 上报桥）
    collect_js_path = COLLECT_JS_DIR / spec["js_file"].split("/")[-1]
    if not collect_js_path.is_file():
        raise FileNotFoundError(f"collect_js missing: {collect_js_path}")
    collect_js = collect_js_path.read_text(encoding="utf-8")
    values["COLLECT_JS"] = collect_js
    (out_dir / "collect.html").write_text(
        render_template(COLLECT_PAGE_TEMPLATE, values), encoding="utf-8")
    (out_dir / "collector.js").write_text(
        render_template(COLLECTOR_JS_TEMPLATE, values), encoding="utf-8")

    # 行为剧本页（有模块则迁移模块内容 + 采集桥；无模块有行为面则生成通用剧本页）
    if has_behavior:
        if module_file:
            module_path = PAGE_MODULES_DIR / module_file.split("/")[-1]
            if not module_path.is_file():
                raise FileNotFoundError(f"page_module missing: {module_path}")
            module_html = module_path.read_text(encoding="utf-8")
            # 模块引用 /static/... 改为本地脚本
            module_html = module_html.replace(
                '/static/js/behavior-core.js', 'behavior-core.js')
            module_html = module_html.replace(
                '/static/js/page-behavior.js', 'challenge-bridge.js')
            # 确保桥脚本被引用（模块原引用经 /static 替换后若不存在则插入）
            if 'challenge-bridge.js' not in module_html:
                module_html = module_html.replace(
                    '</head>',
                    '<script src="behavior-core.js"></script>\n'
                    '<script src="challenge-bridge.js"></script>\n</head>', 1)
            (out_dir / "challenge.html").write_text(module_html, encoding="utf-8")
        else:
            (out_dir / "challenge.html").write_text(
                render_template(GENERIC_CHALLENGE_TEMPLATE, values), encoding="utf-8")
        (out_dir / "challenge-bridge.js").write_text(
            render_template(CHALLENGE_BRIDGE_JS_TEMPLATE, values), encoding="utf-8")
        (out_dir / "behavior-core.js").write_bytes(
            (STATIC_JS_DIR / "behavior-core.js").read_bytes())

    # README
    (out_dir / "README.md").write_text(
        render_template(README_TEMPLATE, values), encoding="utf-8")

    return {"slug": slug, "files": sorted(p.name for p in out_dir.iterdir())}


def main() -> int:
    PLUGINS_DIR.mkdir(parents=True, exist_ok=True)
    for spec in SEED_ENTRIES:
        result = build_plugin(spec)
        print(f"[{result['slug']}] {', '.join(result['files'])}")
    print(f"generated {len(SEED_ENTRIES)} plugins under {PLUGINS_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
