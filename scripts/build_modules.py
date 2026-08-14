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
    <a href="/admin/">管理后台</a>
  </div>
</header>
<main class="container">
  <div class="hero">
    <h1>__NAME__</h1>
    <p class="hero-sub">__RISK_TYPE__ · __WEBSITE__</p>
  </div>

  <div class="section">
    <h2>采集参数</h2>
    <p>__DESCRIPTION__</p>
    <div class="table-wrap">
      <table>
        <tr><th>参数</th><th>采集内容</th></tr>
        __PARAM_ROWS__
      </table>
    </div>
  </div>

  <div class="section">
    <h2>参数说明</h2>
    <ul class="param-detail">
      __PARAM_DETAILS__
    </ul>
  </div>

  <div class="section">
    <h2>使用约束</h2>
    <p>__NOTICE__</p>
  </div>

  <div class="actions">
    <a class="btn btn-primary" href="/collect/__SLUG__">环境指纹采集</a>
    __BEHAVIOR_BUTTON__
    <a class="btn" href="/e/__SLUG__/fingerprints">指纹数据</a>
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
    <p class="hero-sub">__RISK_TYPE__ · __WEBSITE__ · 环境指纹采集</p>
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
    <a class="btn" href="/e/__SLUG__">条目详情</a>
    <a class="btn" href="/e/__SLUG__/fingerprints">指纹数据</a>
    <a class="btn" href="/">返回导航</a>
  </div>
</main>
<script src="/static/js/collector.js"></script>
<script src="/modules/__SLUG__/collect.js"></script>
</body>
</html>
"""

# 参数说明：采集内容（表格列）与作用（参数说明列）
# 结构：(采集内容简述, 作用说明)
PARAM_DESCRIPTIONS = {
    # 通用环境组件
    "navigator": ("浏览器与设备属性：UA、平台、语言、硬件并发、插件集合等 20+ 字段",
                  "识别浏览器类型、操作系统与基础硬件配置；UA 与多字段交叉一致性的基础数据。"),
    "screen": ("屏幕分辨率、可用区域与色深",
               "识别显示设备规格；与视口数据交叉验证分辨率伪装。"),
    "viewport": ("视口尺寸、设备像素比与窗口偏移",
                 "识别浏览器窗口状态；DPR 与分辨率组合是设备指纹的稳定分量。"),
    "canvas": ("Canvas 双画布渲染哈希（基准图与互补图）",
               "显卡/字体/渲染器的组合指纹；两次渲染一致性可暴露画布噪声注入。"),
    "emoji": ("Emoji 字形渲染哈希",
              "系统 Emoji 字体集指纹，Windows/macOS 差异显著。"),
    "webgl": ("WebGL 18 项参数与 UNMASKED 渲染器标识",
              "GPU 型号与驱动指纹；渲染器品牌分级判定伪造。"),
    "webgl2": ("WebGL2 参数面（可用时）",
               "GPU 能力指纹的扩展维度。"),
    "offscreen": ("OffscreenCanvas 支持与上下文类型",
                 "浏览器版本能力面指纹。"),
    "audio": ("音频栈指纹：采样率、基准延迟与波形哈希",
              "音频硬件/驱动组合指纹；波形二次渲染一致性可暴露伪造。"),
    "timing": ("导航时序关键点（浅层）",
               "页面加载性能特征。"),
    "timingDeep": ("导航时序全 21 字段、资源与绘制条目计数",
                   "加载行为特征；与声明环境的一致性交叉点。"),
    "matchMedia": ("9 组媒体查询响应（断点/配色/指针/悬停）",
                 "显示设备与浏览器偏好指纹。"),
    "cssom": ("CSS 特性支持与样式系统行为（:focus-within/宽色域/cssRules）",
              "浏览器渲染引擎版本指纹；cssRules 可访问性反映安全上下文。"),
    "storage": ("localStorage/sessionStorage 读写往返与 indexedDB 可用性",
                "存储可用性指纹；隐私模式下读写失败是重要特征。"),
    "intl": ("国际化环境：时区、日历、数字系统、区域设置",
             "系统区域指纹；时区与 IP 地理位置的交叉验证基础。"),
    "fonts": ("常用字体可用性（9 组布尔探测）",
              "字体集合指纹的基础维度。"),
    "fontsMeasure": ("10 组字体字形测量宽度",
                     "字体渲染指纹：同一字体在不同系统上的度量差异。"),
    "apiSurface": ("22 项 Web API 存在性矩阵（电池/权限/WebXR/串口等）",
                   "浏览器版本与功能面指纹；缺失项反映隐私策略或伪装。"),
    "prototypeProbes": ("原型行为探测：hasFocus/setProperty 描述符与 String receiver 行为",
                        "检测原型篡改：原生函数行为异常是自动化环境的主要特征。"),
    "pluginsDeep": ("插件集合深度行为（item/namedItem/首插件详情）",
                    "插件体系指纹与集合一致性验证。"),
    "automationFlags": ("自动化痕迹：webdriver 描述符、CDP/Selenium 遗留属性、headless UA",
                        "自动化环境检测：无头浏览器与驱动注入的直接证据。"),
    "webrtc": ("RTCPeerConnection 与数据通道行为",
                "WebRTC 能力指纹；可用于后续网络面扩展。"),
    "iframeRealm": ("同源 iframe realm 基础属性对比",
                    "多 realm 环境一致性：主窗口与子框架的指纹差异。"),
    "iframeRealmDeep": ("跨 realm 类型探测（Date/Array/Error 的 instanceof 语义）",
                        "JS 引擎 realm 隔离指纹；跨 realm 异常是伪装环境的特征。"),
    "cookieHistory": ("Cookie 写读往返、历史记录长度与窗口关系",
                      "存储与导航状态指纹；窗口关系反映嵌入场景。"),
    "media": ("语音合成/识别与 MediaSource 能力",
              "媒体能力面指纹。"),
    "wasm": ("WebAssembly 内存与模块 API 行为",
             "WASM 能力指纹；构造行为差异反映引擎版本。"),
    "svg": ("SVG getBBox/getScreenCTM 渲染形状",
            "SVG 渲染引擎指纹。"),
    "domrect": ("DOMRect.fromRect/toJSON 键集与 getClientRects 行为",
                "DOM 几何 API 指纹（引擎版本敏感）。"),
    "textmetrics": ("文本测量边界行为（零宽字符/Emoji/连字）",
                    "文本引擎指纹：边界字符测量差异显著。"),
    "voices": ("语音合成声音列表（名称/语言/本地或远程）",
               "系统 TTS 声音集合指纹，设备级差异明显。"),
    "worker": ("Worker 环境属性往返（UA/webdriver/deviceMemory）",
               "Worker realm 与主线程一致性验证。"),
    # deepProbes
    "queryLies": ("10 核心接口的函数完整性逐项检查（toString 白名单/ownProps/描述符/栈帧）",
                  "原生函数被包装或篡改时在此暴露；每项检查失败都是具体证据。"),
    "prototypeLies": ("40+ 接口原型链属性采集与 hashMini 基线",
                      "原型面基线指纹；与已知扩展哈希比对识别浏览器扩展。"),
    "phantomIframe": ("隐藏 iframe 隔离环境 12 项同款 API 对比",
                      "主窗口与隔离环境的差异暴露扩展注入或环境伪装。"),
    "stability": ("双画布逐像素稳定性、双音频波形一致性、Math 期望值表",
                  "每次渲染结果不同的画布/音频是噪声注入的直接证据；Math 输出偏差反映引擎异常。"),
    "crossValidation": ("plugins 与 mimeTypes 双向一致性验证",
                       "插件集合结构异常（缺失/错配）暴露伪造。"),
    "trash": ("垃圾值检测：乱码正则与 WebGL 渲染器品牌分级",
              "不符合真实命名规律的 UA/渲染器字符串判定为可疑。"),
    "resistance": ("反指纹模式识别：timer 精度/RFP 特征/Brave/Tor 组合",
                   "隐私防护模式（RFP 等）的指纹本身也是特征：识别一致化环境。"),
    # 风控专有组件
    "ddGlobals": ("DataDome 全局变量形状（ddjskey/ddoptions 键名与类型）",
                  "DataDome 集成状态指纹：标签脚本是否初始化及其暴露面。"),
    "eventCounters": ("DataDome 行为计数器初始结构（click/keydown/mousemove 监听状态）",
                      "DataDome 行为埋点计数器的结构基线。"),
    "cidShape": ("DataDome 会话标识形状生成能力（时间戳 base36 + 随机）",
                 "会话标识生成环境的能力验证。"),
    "envelopeInputs": ("DataDome 请求信封输入面（路径长度/脚本元素计数/iframe 数）",
                       "fingerprint POST 九字段信封的输入结构。"),
    "definePropertySurface": ("属性埋点可覆写性（defineProperty 行为与 navigator 封装状态）",
                              "DataDome 埋点机制依赖的环境可写性验证。"),
    "storageDdKeys": ("本地存储中 DataDome 键名集合",
                      "DataDome 状态持久化痕迹。"),
    "rsGlobals": ("瑞数全局变量形状（$_ts 等初始化标记的键名与类型）",
                  "瑞数挑战脚本初始化状态指纹。"),
    "scriptStructure": ("页面脚本结构（内联/外链分组与动态标记计数）",
                        "瑞数动态注入脚本的注入面结构。"),
    "metaAndUrl": ("Meta 标签集合与 URL 参数名结构",
                   "挑战页元数据与动态参数名形状。"),
    "cookieKeyShape": ("Cookie 键名集合与平均键长",
                       "瑞数动态 Cookie 的命名形状。"),
    "domGate": ("DOM 环境门（createElement 原型链深度与原生性）",
                "瑞数挑战执行依赖的 DOM 环境完整性。"),
    "toStringDeep": ("函数字符串化深度（toString 的 toString、eval 形状）",
                     "飞林反调试面：函数伪装检测的深度证据。"),
    "documentAll": ("document.all 行为（typeof/真值/长度）",
                    "浏览器真实性检测向量：老式兼容层行为差异。"),
    "extensionScan": ("扩展与篡改脚本检测（GM 前缀/unsafeWindow/用户脚本标记）",
                      "浏览器扩展注入痕迹扫描。"),
    "callbackIntegrity": ("回调完整性（setTimeout/setInterval 原生性与可覆写性）",
                          "定时器被包装的证据：飞林检测回调链完整性。"),
    "pluginConsistency": ("插件集合一致性（plugins 数与 mimeTypes 数比率）",
                          "飞林插件一致性验证向量。"),
    "feilinGlobals": ("飞林 SDK 全局变量形状",
                      "飞林指纹 SDK 初始化痕迹。"),
    "incapCookieKeys": ("Imperva Cookie 键名形状（visid/ses/nlbi/reese 前缀分组）",
                        "Incapsula 会话与挑战状态的 Cookie 痕迹。"),
    "scriptSrcShape": ("挑战脚本 src 结构（域名/路径前缀/查询参数）",
                       "Imperva 动态挑战脚本的加载结构。"),
    "clockPrecision": ("时钟精度（performance.now 分辨率与定时器最小间隔）",
                       "Imperva 时钟一致性检测的对照数据。"),
    "transportIntegrity": ("传输层完整性（XHR open/send 与 fetch 的原生性）",
                           "XHR/fetch 被包装的证据。"),
    "audioRenderTiming": ("OfflineAudioContext 渲染耗时",
                          "挑战求值依赖的环境签名：音频渲染性能特征。"),
    "webglReadPixels": ("WebGL 1x1 readPixels 像素哈希与 WebGL2 存在性",
                        "BOSS 设备指纹的 GPU 像素读取分量。"),
    "deviceFingerprintShape": ("设备指纹字段组合（deviceMemory/并发数/pdfViewerEnabled 等）",
                               "BOSS 设备指纹的字段清单与组合形状。"),
    "consoleSideChannel": ("控制台序列化侧信道（log/table/error 的描述符与原生性）",
                           "BOSS 遥测的 console 侧信道完整性。"),
    "inputEventSurface": ("输入事件面（composition/InputEvent/isTrusted 支持）",
                          "IME 与输入事件能力面：BOSS 行为检测的输入语义基础。"),
    "resourceDomains": ("页面资源域名分组计数",
                        "页面资源加载结构：遥测域特征。"),
}

PARAM_FALLBACK = ("环境探测参数", "采集环境特征数据，用于指纹对照与一致性分析。")


def extract_params(collect_js: str) -> list[str]:
    """从采集脚本提取探测组名（safe/safeSync 包装的组件与 deepProbes 组）。"""
    import re
    names: list[str] = []
    for m in re.finditer(r"safe(?:Sync)?\(\s*'(\w+)'", collect_js):
        name = m.group(1)
        if name not in names:
            names.append(name)
    for m in re.finditer(r"deepProbes\.(\w+)\.(\w+)\s*=", collect_js):
        key = m.group(2)
        if key not in names:
            names.append(key)
    return names


def param_description(name: str) -> tuple[str, str]:
    return PARAM_DESCRIPTIONS.get(name, PARAM_FALLBACK)


def build_param_rows(collect_js: str) -> str:
    rows = []
    for name in extract_params(collect_js):
        brief, _ = param_description(name)
        rows.append(f"        <tr><td><code>{name}</code></td><td>{brief}</td></tr>")
    return "\n".join(rows)


def build_param_details(collect_js: str) -> str:
    items = []
    for name in extract_params(collect_js):
        brief, purpose = param_description(name)
        items.append(
            f"      <li><code>{name}</code> —— {brief}。<br>"
            f"<span class=\"muted\">作用：{purpose}</span></li>")
    return "\n".join(items)


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

README_TEMPLATE = """# __NAME__ 采集模块

__RISK_TYPE__ 风控（__WEBSITE__）的指纹采集模块。

## 目录

- `info.html`       条目详情：采集参数清单与参数说明
- `collect.html`    环境指纹采集页：自动执行 collect.js 并上报平台
- `collect.js`      环境指纹采集脚本（可审计可复用）
- `challenge.html`  行为指纹采集页（复刻原网站行为逻辑，如有）
- `README.md`       本文件

## 平台接入

| 页面 | 平台路由 |
|---|---|
| 条目详情 | `/e/__SLUG__` |
| 环境指纹采集 | `/collect/__SLUG__` |
| 行为指纹采集 | `/collect/__SLUG__/behavior` |
| 指纹数据 | `/e/__SLUG__/fingerprints` |

## 采集参数

__DESCRIPTION__

## 使用约束

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

    # 读取采集脚本：用于提取参数清单
    collect_target = out_dir / "collect.js"
    if not collect_target.is_file():
        raise FileNotFoundError(f"collect.js missing: {collect_target}")
    collect_js_content = collect_target.read_text(encoding="utf-8")

    tags = spec.get("tags") or []
    tags_html = " ".join(
        '<span class="badge badge-ok">环境指纹</span>' if t == "环境面"
        else ('<span class="badge badge-violet">行为指纹</span>' if t == "行为面"
              else f'<span class="badge">{t}</span>')
        for t in tags
    )
    behavior_button = ""
    if has_behavior:
        behavior_button = ('    <a class="btn btn-primary" href="/collect/__SLUG__/behavior">行为指纹采集</a>\n')
    values = {
        "SLUG": slug, "NAME": name, "RISK_TYPE": risk_type, "WEBSITE": website,
        "DESCRIPTION": spec["description"],
        "TAGS_HTML": tags_html,
        "PARAM_ROWS": build_param_rows(collect_js_content),
        "PARAM_DETAILS": build_param_details(collect_js_content),
        "BEHAVIOR_BUTTON": behavior_button,
        "NOTICE": NOTICE_TEXT,
    }

    # 1. 展示页
    (out_dir / "info.html").write_text(render(INFO_TEMPLATE, values), encoding="utf-8")

    # 2. 环境采集页
    (out_dir / "collect.html").write_text(render(COLLECT_TEMPLATE, values), encoding="utf-8")

    # 3. 采集脚本已在 modules/<slug>/ 内原地维护；行为指纹采集页需注入
    #    平台采集基础层引用（静态托管后不再经平台渲染器注入）
    collect_target = out_dir / "collect.js"
    if not collect_target.is_file():
        raise FileNotFoundError(f"collect.js missing: {collect_target}")
    if has_behavior:
        challenge_path = out_dir / "challenge.html"
        if not challenge_path.is_file():
            raise FileNotFoundError(f"challenge.html missing: {challenge_path}")
        challenge_html = challenge_path.read_text(encoding="utf-8")
        inject = (
            '<script src="/static/js/behavior-core.js"></script>\n'
            f'<script>window.__FP_ENTRY_SLUG = "{slug}";\n'
            f'window.__FP_ENTRY_NAME = "{name}";</script>\n'
            '<script src="/static/js/page-behavior.js"></script>\n'
        )
        if 'behavior-core.js' not in challenge_html:
            if '</head>' in challenge_html:
                challenge_html = challenge_html.replace('</head>', inject + '</head>', 1)
            else:
                challenge_html = inject + challenge_html
            challenge_path.write_text(challenge_html, encoding='utf-8', newline='\n')

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
