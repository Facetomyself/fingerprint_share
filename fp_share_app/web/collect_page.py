"""采集页渲染：声明横幅 + collector.js + 内联条目 JS（字符串模板，无 Jinja2）。"""

from __future__ import annotations

import html
import re

from fastapi.responses import HTMLResponse

_SCRIPT_CLOSE_RE = re.compile(r"</\s*script", re.IGNORECASE)


def _escape_script_block(js: str) -> str:
    """防止上传 JS 中的 </script 字面量提前闭合内联脚本块。"""
    return _SCRIPT_CLOSE_RE.sub("<\\\\/script", js)


def render_collect_page(entry_name: str, slug: str, collect_js: str) -> HTMLResponse:
    safe_name = html.escape(entry_name)
    safe_slug = html.escape(slug)
    html_text = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>环境指纹采集 - {safe_name}</title>
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
    <h1>{safe_name}</h1>
    <p class="hero-sub">环境指纹采集 · 条目 <code>{safe_slug}</code> · 脚本自动运行并上报</p>
  </div>
  <div class="banner">
    此页面将采集你的浏览器环境指纹并存储与共享。仅用于风控研究对照，请勿在隐私敏感环境打开。
  </div>
  <div class="section">
    <div id="fp-status" class="status">正在采集环境指纹...</div>
    <p class="muted">采集包含环境快照、deepProbes 谎言检测与反指纹模式识别，通常几秒内完成。</p>
  </div>
  <div class="actions" style="margin-top:14px;">
    <a class="btn" href="/e/{safe_slug}">条目详情</a>
    <a class="btn" href="/e/{safe_slug}/fingerprints">浏览指纹数据</a>
    <a class="btn" href="/">返回导航</a>
  </div>
</main>
<script src="/static/js/collector.js"></script>
<script>
{_escape_script_block(collect_js)}
</script>
</body>
</html>
"""
    return HTMLResponse(html_text)


def render_page_module(entry_name: str, slug: str, module_html: str) -> HTMLResponse:
    """渲染条目级复刻页面模块（行为剧本页）。

    模块是完整 HTML 文档；平台在 </head>（或文档开头）自动注入行为采集基础层：
    behavior-core.js + page-behavior.js + 条目配置。模块作者无需手动引用。
    模块脚本通过 window.__fpBehavior 挂钩采集器（详见 docs/page-module-contract.md）。
    """
    safe_slug = html.escape(slug)
    inject_block = (
        '<script src="/static/js/behavior-core.js"></script>\n'
        '<script>window.__FP_ENTRY_SLUG = "' + safe_slug + '";\n'
        'window.__FP_ENTRY_NAME = "' + html.escape(entry_name) + '";</script>\n'
        '<script src="/static/js/page-behavior.js"></script>\n'
    )
    # 注入到 </head> 前：采集层必须先于模块剧本 script 执行（剧本依赖 __fpBehavior）；
    # page-behavior 的悬浮条挂载有 body 就绪防御（mountBar 重试）。
    if "</head>" in module_html:
        rendered = module_html.replace("</head>", inject_block + "</head>", 1)
    else:
        rendered = inject_block + module_html
    return HTMLResponse(rendered)
