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
<main class="container">
  <div class="banner">
    此页面将采集你的浏览器环境指纹并存储与共享。仅用于风控研究对照，请勿在隐私敏感环境打开。
  </div>
  <h1>{safe_name}</h1>
  <p class="muted">条目: <code>{safe_slug}</code> | 采集脚本将自动运行并上报</p>
  <div id="fp-status" class="status">正在采集环境指纹...</div>
  <p><a href="/e/{safe_slug}">返回条目页</a> | <a href="/">返回导航</a></p>
</main>
<script src="/static/js/collector.js"></script>
<script>
{_escape_script_block(collect_js)}
</script>
</body>
</html>
"""
    return HTMLResponse(html_text)
