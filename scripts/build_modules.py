"""生成每个风控的插件式页面模块包（平台 Web 体系内的完整功能单元）。

每个风控一个目录 modules/<slug>/：
  info.html       展示页：采集了什么 / 怎么使用 / 注意事项
  collect.html    环境采集页（引用同目录 collect.js 与平台采集基础层）
  collect.js      环境采集脚本（从 collect_js/ 迁移）
  challenge.html  行为剧本页（从 page_modules/ 迁移，有则）
  README.md       使用说明

平台路由优先渲染模块目录文件（见 routes_public.py），本脚本负责生成与迁移。

用法：
  D:\\reverse_ENV\\.venv\\Scripts\\python.exe scripts\\build_modules.py
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fp_share_app.application.seed import SEED_ENTRIES  # noqa: E402

MODULES_DIR = PROJECT_ROOT / "modules"
COLLECT_JS_DIR = PROJECT_ROOT / "collect_js"
PAGE_MODULES_DIR = PROJECT_ROOT / "page_modules"

NOTICE_TEXT = """1. 采集页面将采集您的浏览器环境/行为指纹并存储至共享数据库。该数据仅用于
   风控研究对照分析，请勿在包含隐私信息的环境中访问。
2. 采集数据在本平台内公开共享。将数据带出平台时，须遵守 restricted-local
   数据分级纪律：环境数据仅允许输出脱敏摘要（组件名、哈希、维度计数）；
   行为轨迹与击键间隔原值不得输出，仅允许信号判定摘要与统计值。
3. 采集脚本由平台管理员编写与维护，请勿引入第三方来源代码。"""

INFO_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__NAME__ - 指纹共享平台</title>
<link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
<header class="topnav">
  <div class="container">
    <span class="brand">指纹共享平台</span>
    <a href="/">导航</a>
    <a href="/admin/">后台</a>
  </div>
</header>
<main class="container">
  <div class="hero">
    <h1>__NAME__</h1>
    <p class="hero-sub">__RISK_TYPE__ 风控 · __WEBSITE__ · 完整功能插件（采集脚本与展示页面一体化）</p>
  </div>

  <div class="section">
    <h2>采集了什么</h2>
    <p>__DESCRIPTION__</p>
    <p style="margin-top:10px;">
      __TAGS_HTML__
    </p>
  </div>

  <div class="section">
    <h2>怎么使用</h2>
    <ul>
      <li>打开<a href="/collect/__SLUG__">环境采集页</a>：执行环境指纹采集，自动上报平台。</li>
      __BEHAVIOR_STEP__
      <li>在<a href="/e/__SLUG__/fingerprints">指纹页</a>浏览与下载采集结果（支持 UA 大类/小类、OS、时区等分面筛选）。</li>
      <li>采集脚本源码见本插件目录 <code>collect.js</code>（集成在本插件中，可审计可复用）。</li>
    </ul>
  </div>

  <div class="section">
    <h2>注意事项</h2>
    <p>__NOTICE__</p>
  </div>

  <div class="actions">
    <a class="btn btn-primary" href="/collect/__SLUG__">打开环境采集页</a>
    __BEHAVIOR_BUTTON__
    <a class="btn" href="/e/__SLUG__/fingerprints">浏览指纹数据</a>
    <a class="btn" href="/">返回导航</a>
  </div>
</main>
</body>
</html>
"""

COLLECT_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>环境指纹采集 - __NAME__</title>
<link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
<header class="topnav">
  <div class="container">
    <span class="brand">指纹共享平台</span>
    <a href="/">导航</a>
  </div>
</header>
<main class="container">
  <div class="hero">
    <h1>__NAME__</h1>
    <p class="hero-sub">环境指纹采集 · 采集脚本 <code>collect.js</code> 集成在本插件中 · 自动运行并上报</p>
  </div>
  <div class="banner">
    本页面将采集您的浏览器环境指纹并存储至共享数据库。该数据仅用于风控研究对照分析，
    请勿在包含隐私信息的环境中访问本页面。
  </div>
  <div class="section">
    <div id="fp-status" class="status">正在采集环境指纹...</div>
    <p class="muted">采集包含环境快照与深度探测（谎言检测/反指纹模式识别），通常几秒内完成。</p>
  </div>
  <div class="actions" style="margin-top:14px;">
    <a class="btn" href="/e/__SLUG__">插件展示页</a>
    <a class="btn" href="/e/__SLUG__/fingerprints">浏览指纹数据</a>
    <a class="btn" href="/">返回导航</a>
  </div>
</main>
<script src="/static/js/collector.js"></script>
<script src="/modules/__SLUG__/collect.js"></script>
</body>
</html>
"""

GENERIC_CHALLENGE_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>行为采集 - __NAME__</title>
<link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
<header class="topnav">
  <div class="container">
    <span class="brand">指纹共享平台</span>
    <a href="/">导航</a>
  </div>
</header>
<main class="container">
  <div class="hero">
    <h1>__NAME__ · 行为采集</h1>
    <p class="hero-sub">请模拟真实交互：移动鼠标、滚动页面、在输入框中打字。30 秒后自动上报。</p>
  </div>
  <div class="banner">
    此页面将采集你的浏览器行为指纹（鼠标移动轨迹、键盘输入节奏、滚动模式）并存储与共享。
    仅用于风控研究对照，请勿在隐私敏感环境打开。
  </div>
  <div class="section">
    <input type="text" id="bh-input-demo" placeholder="在这里打一段文字（示例）" style="max-width:420px;">
    <div class="actions" style="margin-top:12px;">
      <button id="bh-submit" disabled>结束并提交</button>
    </div>
    <p class="muted"><span id="bh-count">已记录 0 个事件</span> · <span id="bh-timer">等待首次交互...</span></p>
    <div id="bh-status" class="status">等待交互...</div>
  </div>
  <div class="actions">
    <a class="btn" href="/e/__SLUG__">插件展示页</a>
    <a class="btn" href="/">返回导航</a>
  </div>
</main>
<script src="/static/js/behavior-core.js"></script>
<script src="/static/js/behavior.js"></script>
<script>
(function () {
  'use strict';
  var pathMatch = location.pathname.match(/^\\/collect\\/([^/]+)\\/behavior/);
  var slug = pathMatch ? decodeURIComponent(pathMatch[1]) : '__SLUG__';
  var slugEl = document.getElementById('bh-slug');
  window.__FP_ENTRY_SLUG = slug;
})();
</script>
</body>
</html>
"""

README_TEMPLATE = """# __NAME__ 插件（指纹采集模块包）

__RISK_TYPE__ 风控（__WEBSITE__）的完整功能插件：采集脚本与展示页面一体化，
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
| 展示页 | `/e/__SLUG__` |
| 环境采集页 | `/collect/__SLUG__` |
| 行为剧本页 | `/collect/__SLUG__/behavior` |
| 指纹数据 | `/e/__SLUG__/fingerprints` |

## 采集了什么

__DESCRIPTION__

## 注意事项

__NOTICE__
"""


def render(template: str, values: dict) -> str:
    for key, value in values.items():
        template = template.replace(f"__{key}__", str(value))
    return template


def build_module(spec: dict) -> dict:
    slug = spec["slug"]
    name = spec["name"]
    risk_type, _, website = name.partition("-")
    has_behavior = spec.get("has_behavior", 1)
    module_file = spec.get("page_module_file")
    out_dir = MODULES_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    tags = spec.get("tags") or []
    tags_html = " ".join(
        '<span class="badge badge-ok">环境指纹</span>' if t == "环境面"
        else ('<span class="badge badge-violet">行为指纹</span>' if t == "行为面"
              else f'<span class="badge">{t}</span>')
        for t in tags
    )
    behavior_step = ""
    behavior_button = ""
    if has_behavior:
        behavior_step = ("      <li>打开<a href=\"/collect/__SLUG__/behavior\">行为剧本页</a>："
                         "在复刻原网站行为逻辑的页面上按真实交互方式操作，剧本阶段自动记录。</li>")
        behavior_button = ('    <a class="btn btn-primary" href="/collect/__SLUG__/behavior">打开行为剧本页</a>\n')
    values = {
        "SLUG": slug, "NAME": name, "RISK_TYPE": risk_type, "WEBSITE": website,
        "DESCRIPTION": spec["description"],
        "TAGS_HTML": tags_html,
        "BEHAVIOR_STEP": behavior_step,
        "BEHAVIOR_BUTTON": behavior_button,
        "NOTICE": NOTICE_TEXT,
    }

    # 1. 展示页
    (out_dir / "info.html").write_text(render(INFO_TEMPLATE, values), encoding="utf-8")

    # 2. 环境采集页
    (out_dir / "collect.html").write_text(render(COLLECT_TEMPLATE, values), encoding="utf-8")

    # 3. 采集脚本与行为剧本页：已在 modules/<slug>/ 内原地维护（迁移完成），
    #    生成器不覆盖，只校验存在
    collect_target = out_dir / "collect.js"
    if not collect_target.is_file():
        raise FileNotFoundError(f"collect.js missing: {collect_target}")
    if has_behavior and not (out_dir / "challenge.html").is_file():
        raise FileNotFoundError(f"challenge.html missing: {out_dir / 'challenge.html'}")

    # 5. README
    (out_dir / "README.md").write_text(render(README_TEMPLATE, values), encoding="utf-8")

    return {"slug": slug, "files": sorted(p.name for p in out_dir.iterdir())}


def main() -> int:
    MODULES_DIR.mkdir(parents=True, exist_ok=True)
    for spec in SEED_ENTRIES:
        result = build_module(spec)
        print(f"[{result['slug']}] {', '.join(result['files'])}")
    print(f"generated {len(SEED_ENTRIES)} module packages under {MODULES_DIR}")
    print(f"NOTE: collect_js/ 与 page_modules/ 内容已迁移到 modules/，确认后手动删除旧目录。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
