/* generic-deep-v3 深度浏览器指纹基线模板
 * 三层结构：
 *   第一层 environment 快照（32 组，v2 全部 26 组 + wasm/svg/domrect/textmetrics/emoji/voices）
 *   第二层 deepProbes 谎言检测（机制参考 CreepJS MIT，自写实现）：
 *     - lies.queryLies      10 核心接口代表性方法逐项检查（toString 白名单/ownProps/descriptor/栈帧）
 *     - lies.prototypeLies  40+ 接口原型属性递归采集（含 hashMini，供平台基线对比与扩展识别）
 *     - lies.phantomIframe  隐藏 iframe 隔离环境同款 API 对比
 *     - lies.stability      双画布逐像素稳定性 / 双音频波形 / Math 期望值表
 *     - lies.crossValidation plugins<->mimeTypes 双向一致性
 *     - trash               乱码检测正则 + WebGL renderer 品牌分级
 *     - resistance          timer precision / Brave / Firefox RFP / Tor 特征组合
 *   第三层 组装上报（visitorId 稳定子集哈希）
 * 契约：最终调用 window.__fp_submit(payload)；Canvas/音频只存哈希。
 * 注意：本脚本被内联进 <script> 块，源码中不得出现 "</" + "script" 字面量；emoji 用 \u 转义。
 */
(async function () {
  'use strict';

  var SCRIPT = 'generic-deep-v3';
  var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var w = window;
  var d = document;
  var n = w.navigator;
  var errors = [];
  var components = {};
  var deepProbes = { lies: {}, trash: {}, resistance: {} };

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function sha256Hex(text) {
    if (w.crypto && w.crypto.subtle && w.crypto.subtle.digest) {
      return w.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
        var bytes = new Uint8Array(buf);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
          hex += ('0' + bytes[i].toString(16)).slice(-2);
        }
        return hex;
      });
    }
    var h = 0x811c9dc5;
    for (var j = 0; j < text.length; j++) {
      h ^= text.charCodeAt(j);
      h = (h * 0x01000193) >>> 0;
    }
    return Promise.resolve(('0000000' + h.toString(16)).slice(-8));
  }

  function fnvHash(text) {
    var h = 0x811c9dc5;
    for (var j = 0; j < text.length; j++) {
      h ^= text.charCodeAt(j);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  function canonicalJson(obj) {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(canonicalJson).join(',') + ']';
    }
    var keys = Object.keys(obj).sort();
    var parts = keys.map(function (k) { return JSON.stringify(k) + ':' + canonicalJson(obj[k]); });
    return '{' + parts.join(',') + '}';
  }

  function timeoutPromise(ms) {
    return new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, ms);
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, timeoutPromise(ms)]);
  }

  function safeSync(name, fn) {
    try {
      components[name] = fn();
    } catch (e) {
      components[name] = null;
      errors.push(name + ':' + (e && e.name ? e.name : 'error'));
    }
  }

  function asyncError(name, e) {
    components[name] = null;
    errors.push(name + ':' + (e && e.name ? e.name : 'timeout'));
  }

  function probeError(probe, name, e) {
    deepProbes[probe][name] = null;
    errors.push(probe + '.' + name + ':' + (e && e.name ? e.name : 'error'));
  }

  function descriptorOf(target, prop) {
    try {
      var desc = Object.getOwnPropertyDescriptor(target, prop);
      if (!desc) { return null; }
      return {
        configurable: desc.configurable,
        enumerable: desc.enumerable,
        hasGet: typeof desc.get === 'function',
        hasSet: typeof desc.set === 'function'
      };
    } catch (e) {
      return null;
    }
  }

  // ============================================================
  // 第一层 environment 快照（v2 全组 + 6 新组）
  // ============================================================

  function navigatorProbe() {
    var out = {};
    var props = ['userAgent', 'platform', 'language', 'cookieEnabled', 'webdriver',
      'hardwareConcurrency', 'maxTouchPoints', 'onLine', 'vendor', 'vendorSub',
      'product', 'productSub', 'appCodeName', 'appName', 'appVersion', 'doNotTrack',
      'pdfViewerEnabled', 'oscpu', 'buildID'];
    props.forEach(function (p) {
      try { out[p] = n[p]; } catch (e) { out[p] = null; }
    });
    try { out.languages = Array.prototype.slice.call(n.languages); } catch (e) { out.languages = null; }
    try {
      out.plugins = Array.prototype.slice.call(n.plugins || []).map(function (pl) { return pl.name; });
    } catch (e) { out.plugins = null; }
    try {
      out.mimeTypes = Array.prototype.slice.call(n.mimeTypes || []).map(function (mt) { return mt.type; });
    } catch (e) { out.mimeTypes = null; }
    try { out.javaEnabled = n.javaEnabled ? n.javaEnabled() : null; } catch (e) { out.javaEnabled = null; }
    try {
      out.userAgentData = n.userAgentData ? {
        brands: n.userAgentData.brands ? n.userAgentData.brands.map(function (b) {
          return b.brand + ':' + b.version;
        }) : null,
        platform: n.userAgentData.platform,
        mobile: n.userAgentData.mobile
      } : null;
    } catch (e) { out.userAgentData = null; }
    return out;
  }

  function screenProbe() {
    var s = w.screen;
    var out = {};
    var props = ['width', 'height', 'availWidth', 'availHeight', 'availLeft', 'availTop',
      'colorDepth', 'pixelDepth'];
    props.forEach(function (p) {
      try { out[p] = s[p]; } catch (e) { out[p] = null; }
    });
    try { out.orientation = s.orientation ? { type: s.orientation.type, angle: s.orientation.angle } : null; }
    catch (e) { out.orientation = null; }
    return out;
  }

  function viewportProbe() {
    return {
      innerWidth: w.innerWidth,
      innerHeight: w.innerHeight,
      outerWidth: w.outerWidth,
      outerHeight: w.outerHeight,
      devicePixelRatio: w.devicePixelRatio,
      screenX: w.screenX,
      screenY: w.screenY,
      scrollX: w.scrollX,
      scrollY: w.scrollY,
      length: w.length
    };
  }

  function canvasToDataUrl(width, height, draw) {
    var c = d.createElement('canvas');
    c.width = width;
    c.height = height;
    var ctx = c.getContext('2d');
    if (!ctx) { throw new Error('no-2d-context'); }
    draw(ctx);
    return c.toDataURL();
  }

  function canvasBaseDraw(ctx) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(100, 1, 60, 20);
    ctx.fillStyle = '#069';
    ctx.font = '11pt Arial';
    ctx.fillText('fp-share-baseline', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.font = '18pt Arial';
    ctx.fillText('Cwm fjordbank glyphs', 4, 40);
    ctx.strokeStyle = '#a1a1a1';
    ctx.beginPath();
    ctx.arc(60, 30, 12, 0, Math.PI * 2, true);
    ctx.stroke();
  }

  function canvasAltDraw(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.fillRect(4, 4, 8, 8);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.fillRect(2, 6, 10, 4);
    ctx.font = '9pt monospace';
    ctx.fillText('xGyWuSsJi', 1, 14);
  }

  function webglProbe(kind) {
    var c = d.createElement('canvas');
    var gl = null;
    try { gl = c.getContext(kind); } catch (e) { gl = null; }
    if (!gl) { return null; }
    var out = {};
    var params = ['VENDOR', 'RENDERER', 'VERSION', 'SHADING_LANGUAGE_VERSION',
      'MAX_TEXTURE_SIZE', 'MAX_VIEWPORT_DIMS', 'MAX_RENDERBUFFER_SIZE',
      'MAX_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_ATTRIBS', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
      'MAX_COMBINED_TEXTURE_IMAGE_UNITS', 'MAX_CUBE_MAP_TEXTURE_SIZE', 'RED_BITS',
      'GREEN_BITS', 'BLUE_BITS', 'ALPHA_BITS', 'DEPTH_BITS', 'STENCIL_BITS'];
    params.forEach(function (p) {
      try { out[p] = String(gl.getParameter(gl[p])); } catch (e) { out[p] = null; }
    });
    try {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        out.UNMASKED_VENDOR_WEBGL = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
        out.UNMASKED_RENDERER_WEBGL = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      }
    } catch (e) { /* 无扩展则忽略 */ }
    try {
      out.extensions = (gl.getSupportedExtensions() || []).length;
    } catch (e) { out.extensions = null; }
    return out;
  }

  function offscreenProbe() {
    var out = { supported: 'OffscreenCanvas' in w };
    if (!out.supported) { return out; }
    try {
      var oc2d = new w.OffscreenCanvas(16, 16);
      out.context2d = !!oc2d.getContext('2d');
    } catch (e) { out.context2d = null; }
    try {
      var ocgl = new w.OffscreenCanvas(16, 16);
      out.webgl = !!ocgl.getContext('webgl');
    } catch (e) { out.webgl = null; }
    return out;
  }

  function audioProbe() {
    var out = {};
    var AC = w.AudioContext || w.webkitAudioContext;
    if (AC) {
      var ctx = new AC();
      out.sampleRate = ctx.sampleRate;
      out.state = ctx.state;
      out.baseLatency = ctx.baseLatency;
      if (ctx.close) { try { ctx.close(); } catch (e) { /* 忽略 */ } }
    }
    var OAC = w.OfflineAudioContext || w.webkitOfflineAudioContext;
    if (!OAC) { return Promise.resolve(out); }
    try {
      var octx = new OAC(1, 44100, 44100);
      var osc = octx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      var gain = octx.createGain();
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(octx.destination);
      osc.start(0);
      return octx.startRendering().then(function (buf) {
        var samples = buf.getChannelData(0);
        var sum = 0;
        for (var i = 4400; i < 4500; i++) { sum += samples[i]; }
        out.offlineSampleRate = octx.sampleRate;
        out.waveHash = sum.toFixed(4);
        return out;
      });
    } catch (e) {
      out.offlineError = e && e.name ? e.name : 'error';
      return Promise.resolve(out);
    }
  }

  function timingProbe() {
    var out = { navigationEntries: 0 };
    try {
      out.navigationEntries = w.performance.getEntriesByType('navigation').length;
    } catch (e) { out.navigationEntries = null; }
    var pt = w.performance.timing;
    if (pt) {
      out.navigationStart = pt.navigationStart;
      out.domContentLoadedEventEnd = pt.domContentLoadedEventEnd;
      out.loadEventEnd = pt.loadEventEnd;
    }
    return out;
  }

  function matchMediaProbe() {
    var queries = ['(max-width: 600px)', '(max-width: 800px)', '(max-width: 1024px)',
      '(max-width: 1440px)', '(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)',
      '(pointer: coarse)', '(hover: hover)', '(display-mode: standalone)'];
    var out = {};
    queries.forEach(function (q) {
      try { out[q] = w.matchMedia(q).matches; } catch (e) { out[q] = null; }
    });
    return out;
  }

  function cssomProbe() {
    var out = {};
    try { out.focusWithinSupported = w.CSS && w.CSS.supports ? w.CSS.supports(':focus-within', 'display:none') : null; }
    catch (e) { out.focusWithinSupported = null; }
    try { out.supportsWideGamut = w.CSS && w.CSS.supports ? w.CSS.supports('color', 'color(display-p3 1 0 0)') : null; }
    catch (e) { out.supportsWideGamut = null; }
    out.cssRulesAccessible = false;
    try {
      for (var i = 0; i < d.styleSheets.length; i++) {
        var rules = d.styleSheets[i].cssRules;
        if (rules) { out.cssRulesAccessible = true; break; }
      }
    } catch (e) { out.cssRulesAccessible = false; }
    try {
      var link = d.createElement('a');
      link.href = 'https://fp-share.invalid/';
      link.style.display = 'none';
      d.body.appendChild(link);
      var style = d.defaultView.getComputedStyle(link, null);
      out.aLinkColor = style.color;
      out.aLinkDisplay = style.display;
      d.body.removeChild(link);
    } catch (e) { out.aLinkColor = null; }
    return out;
  }

  function iframeRealmProbe() {
    return new Promise(function (resolve) {
      var frame = d.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:10px;height:10px;';
      frame.srcdoc = '<!doctype html><html><head></head><body></body></html>';
      var done = false;
      function finish(value) {
        if (done) { return; }
        done = true;
        if (frame.parentNode) { frame.parentNode.removeChild(frame); }
        resolve(value);
      }
      frame.onload = function () {
        try {
          var cw = frame.contentWindow;
          var cn = cw.navigator;
          finish({
            webdriver: cn.webdriver,
            language: cn.language,
            userAgent: cn.userAgent,
            deviceMemory: cn.deviceMemory,
            innerWidth: cw.innerWidth,
            innerHeight: cw.innerHeight,
            hasXMLSerializer: typeof cw.XMLSerializer === 'function'
          });
        } catch (e) { finish({ error: e && e.name ? e.name : 'cross-origin' }); }
      };
      frame.onerror = function () { finish({ error: 'load-error' }); };
      d.body.appendChild(frame);
      setTimeout(function () { finish({ error: 'timeout' }); }, 2000);
    });
  }

  function storageProbe() {
    var out = {};
    try {
      var ls = w.localStorage;
      ls.setItem('fp_share_probe', '1');
      out.localStorage = ls.getItem('fp_share_probe') === '1';
      ls.removeItem('fp_share_probe');
    } catch (e) { out.localStorage = false; }
    try {
      var ss = w.sessionStorage;
      ss.setItem('fp_share_probe', '1');
      out.sessionStorage = ss.getItem('fp_share_probe') === '1';
      ss.removeItem('fp_share_probe');
    } catch (e) { out.sessionStorage = false; }
    out.indexedDB = 'indexedDB' in w;
    return out;
  }

  function workerProbe() {
    return new Promise(function (resolve) {
      try {
        var code = 'self.onmessage = function () {' +
          'self.postMessage({ua: navigator.userAgent, wd: navigator.webdriver, mem: navigator.deviceMemory});};';
        var blob = new Blob([code], { type: 'application/javascript' });
        var url = URL.createObjectURL(blob);
        var wk = new Worker(url);
        var done = false;
        function finish(value) {
          if (done) { return; }
          done = true;
          wk.terminate();
          URL.revokeObjectURL(url);
          resolve(value);
        }
        wk.onmessage = function (e) { finish(e.data); };
        wk.onerror = function () { finish({ error: 'worker-error' }); };
        wk.postMessage('ping');
        setTimeout(function () { finish({ error: 'timeout' }); }, 2000);
      } catch (e) { resolve({ error: e && e.name ? e.name : 'error' }); }
    });
  }

  function intlProbe() {
    var out = {};
    try {
      var resolved = Intl.DateTimeFormat().resolvedOptions();
      out.timeZone = resolved.timeZone;
      out.calendar = resolved.calendar;
      out.numberingSystem = resolved.numberingSystem;
      out.locale = resolved.locale;
    } catch (e) { out.resolvedError = e && e.name ? e.name : 'error'; }
    try { out.timezoneOffset = new Date().getTimezoneOffset(); } catch (e) { out.timezoneOffset = null; }
    return out;
  }

  function fontsProbe() {
    if (!d.fonts || typeof d.fonts.check !== 'function') { return null; }
    var fonts = ['Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Segoe UI',
      'Microsoft YaHei', 'SimSun', 'sans-serif', 'monospace'];
    var out = {};
    fonts.forEach(function (f) {
      try { out[f] = d.fonts.check('10px "' + f + '"'); } catch (e) { out[f] = null; }
    });
    return out;
  }

  function apiSurfaceProbe() {
    var out = {};
    var checks = ['getBattery', 'sendBeacon', 'vibrate', 'getGamepads', 'credentials',
      'mediaDevices', 'serviceWorker', 'permissions', 'geolocation', 'connection',
      'requestMediaKeySystemAccess', 'xr', 'usb', 'serial', 'hid', 'bluetooth',
      'storage', 'locks', 'mediaCapabilities', 'wakeLock', 'share', 'canShare'];
    checks.forEach(function (k) {
      try { out[k] = (k in n); } catch (e) { out[k] = null; }
    });
    try { out.getBatteryFn = typeof n.getBattery === 'function'; } catch (e) { out.getBatteryFn = null; }
    try { out.pluginsRefreshFn = typeof n.plugins.refresh === 'function'; } catch (e) { out.pluginsRefreshFn = null; }
    return out;
  }

  function prototypeProbes() {
    var out = {};
    out.hasFocus = {
      descriptor: descriptorOf(Document.prototype, 'hasFocus'),
      returnType: typeof d.hasFocus()
    };
    out.setProperty = {
      descriptor: descriptorOf(CSSStyleDeclaration.prototype, 'setProperty'),
      styleBehavior: (function () {
        var el = d.createElement('div');
        el.style.setProperty('display', 'none', 'important');
        return { display: el.style.display, priority: el.style.getPropertyPriority('display') };
      })(),
      stringReceiverThrows: (function () {
        try {
          CSSStyleDeclaration.prototype.setProperty.call('x', 'display', 'none');
          return false;
        } catch (e) {
          return e && e.name ? e.name : 'error';
        }
      })()
    };
    out.functionToString = {
      fn: typeof (function () { }).toString === 'function' ? (function () { }).toString().slice(0, 60) : null,
      toStringFn: typeof Function.prototype.toString,
      alertFn: typeof w.alert
    };
    out.dateBehavior = {
      dateString: typeof Date() === 'string' ? Date().slice(0, 40) : null,
      dateInstance: String(new Date(0))
    };
    out.errorStack = (function () {
      try {
        var stack = new Error().stack;
        return stack ? stack.split('\n').length : 0;
      } catch (e) { return null; }
    })();
    return out;
  }

  function pluginsDeepProbe() {
    var out = {};
    try {
      out.count = n.plugins ? n.plugins.length : null;
      out.itemFn = typeof n.plugins.item === 'function';
      out.namedItemFn = typeof n.plugins.namedItem === 'function';
      out.itemIndexed = n.plugins.item ? (n.plugins.item(0) === n.plugins[0]) : null;
      out.first = n.plugins && n.plugins[0] ? {
        name: n.plugins[0].name,
        filename: n.plugins[0].filename,
        description: n.plugins[0].description
      } : null;
    } catch (e) { out.error = e && e.name ? e.name : 'error'; }
    try {
      out.mimeTypeCount = n.mimeTypes ? n.mimeTypes.length : null;
    } catch (e) { out.mimeTypeCount = null; }
    return out;
  }

  function fontsMeasureProbe() {
    var c = d.createElement('canvas');
    c.width = 300;
    c.height = 20;
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    var families = ['monospace', 'sans-serif', 'serif', 'Arial', 'Verdana',
      'Times New Roman', 'Courier New', 'Segoe UI', 'Microsoft YaHei', 'SimSun'];
    var out = {};
    families.forEach(function (f) {
      try {
        ctx.font = '10px "' + f + '"';
        out[f] = ctx.measureText('mmmmmmmmmmlli').width.toFixed(3);
      } catch (e) { out[f] = null; }
    });
    return out;
  }

  function automationFlagsProbe() {
    var out = {};
    out.webdriver = n.webdriver;
    out.webdriverDescriptor = descriptorOf(Navigator.prototype, 'webdriver');
    try {
      out.cdcProps = Object.getOwnPropertyNames(w).filter(function (k) {
        return k.indexOf('_cdc_') === 0 || k.indexOf('__playwright') === 0 ||
          k.indexOf('__pw_') === 0 || k.indexOf('_selenium') === 0;
      }).length;
    } catch (e) { out.cdcProps = null; }
    try {
      out.domAutomation = 'domAutomation' in w || 'domAutomationController' in w;
      out.callPhantom = 'callPhantom' in w || '_phantom' in w || 'phantom' in w;
      out.axNode = 'awesomium' in w;
      out.nightmare = 'nightmare' in w || '__nightmare' in w;
    } catch (e) { out.legacyFlags = null; }
    try {
      out.chrome = w.chrome ? {
        runtime: 'runtime' in w.chrome,
        loadTimes: typeof w.chrome.loadTimes === 'function',
        csi: typeof w.chrome.csi === 'function'
      } : null;
    } catch (e) { out.chrome = null; }
    try {
      out.headless = /HeadlessChrome/.test(n.userAgent) || /headless/i.test(n.userAgent);
    } catch (e) { out.headless = null; }
    return out;
  }

  function timingDeepProbe() {
    var out = {};
    var pt = w.performance.timing;
    if (pt) {
      var keys = ['navigationStart', 'unloadEventStart', 'unloadEventEnd', 'redirectStart',
        'redirectEnd', 'fetchStart', 'domainLookupStart', 'domainLookupEnd', 'connectStart',
        'connectEnd', 'secureConnectionStart', 'requestStart', 'responseStart', 'responseEnd',
        'domLoading', 'domInteractive', 'domContentLoadedEventStart', 'domContentLoadedEventEnd',
        'domComplete', 'loadEventStart', 'loadEventEnd'];
      keys.forEach(function (k) {
        out[k] = pt[k];
      });
    }
    try {
      var navEntry = w.performance.getEntriesByType('navigation')[0];
      out.navEntry = navEntry ? {
        type: navEntry.type,
        redirectCount: navEntry.redirectCount,
        transferSize: navEntry.transferSize
      } : null;
    } catch (e) { out.navEntry = null; }
    try {
      out.resourceCount = w.performance.getEntriesByType('resource').length;
      out.paintCount = w.performance.getEntriesByType('paint').length;
    } catch (e) { out.resourceCount = null; }
    return out;
  }

  function webrtcProbe() {
    var out = { supported: 'RTCPeerConnection' in w };
    if (!out.supported) { return out; }
    try {
      var pc = new w.RTCPeerConnection({ iceServers: [] });
      var dc = pc.createDataChannel('fp-probe');
      out.createDataChannel = { label: dc.label, reliable: dc.reliable };
      pc.close();
    } catch (e) {
      out.createDataChannel = e && e.name ? e.name : 'error';
    }
    return out;
  }

  function iframeRealmDeepProbe() {
    return new Promise(function (resolve) {
      var frame = d.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:10px;height:10px;';
      frame.srcdoc = '<!doctype html><html><head></head><body></body></html>';
      var done = false;
      function finish(value) {
        if (done) { return; }
        done = true;
        if (frame.parentNode) { frame.parentNode.removeChild(frame); }
        resolve(value);
      }
      frame.onload = function () {
        try {
          var cw = frame.contentWindow;
          var out = {};
          out.dateIsDate = (new cw.Date()) instanceof w.Date;
          out.dateCrossInstanceof = (new cw.Date()) instanceof cw.Date;
          out.arrayIsArray = Array.isArray(new cw.Array(1));
          out.errorShape = String(new cw.Error('x')).slice(0, 40);
          out.mathRandomType = typeof cw.Math.random;
          out.jsonStringifyType = typeof cw.JSON.stringify;
          out.decodeUriType = typeof cw.decodeURI;
          out.windowEqualsSelf = cw === cw.self;
          out.topEqualsSelf = (function () {
            try { return cw === cw.top; } catch (e) { return null; }
          })();
          finish(out);
        } catch (e) { finish({ error: e && e.name ? e.name : 'cross-origin' }); }
      };
      frame.onerror = function () { finish({ error: 'load-error' }); };
      d.body.appendChild(frame);
      setTimeout(function () { finish({ error: 'timeout' }); }, 2000);
    });
  }

  function cookieHistoryProbe() {
    var out = {};
    try {
      d.cookie = 'fp_share_probe=1; path=/';
      out.cookieWritable = d.cookie.indexOf('fp_share_probe=1') >= 0;
      d.cookie = 'fp_share_probe=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch (e) { out.cookieWritable = false; }
    out.cookieEnabled = n.cookieEnabled;
    out.historyLength = w.history.length;
    out.windowRelations = {
      topEqualsSelf: (function () { try { return w.top === w.self; } catch (e) { return null; } })(),
      parentEqualsSelf: (function () { try { return w.parent === w.self; } catch (e) { return null; } })(),
      opener: w.opener === null ? null : (typeof w.opener)
    };
    return out;
  }

  function mediaProbe() {
    var out = {};
    try {
      out.speechSynthesis = 'speechSynthesis' in w ? {
        supported: true,
        voices: (w.speechSynthesis.getVoices() || []).length
      } : false;
    } catch (e) { out.speechSynthesis = null; }
    try {
      out.speechRecognition = ('SpeechRecognition' in w) || ('webkitSpeechRecognition' in w);
    } catch (e) { out.speechRecognition = null; }
    try {
      out.mediaSource = 'MediaSource' in w;
    } catch (e) { out.mediaSource = null; }
    return out;
  }

  // ---------- 第一层新增组 ----------

  function wasmProbe() {
    var out = { supported: typeof WebAssembly === 'object' && WebAssembly !== null };
    if (!out.supported) { return out; }
    try {
      var mem = new WebAssembly.Memory({ initial: 1 });
      out.memoryBufferLength = mem.buffer.byteLength;
    } catch (e) { out.memoryError = e && e.name ? e.name : 'error'; }
    try {
      out.Module = typeof WebAssembly.Module === 'function';
      out.Instance = typeof WebAssembly.Instance === 'function';
      out.validate = typeof WebAssembly.validate === 'function';
      out.compile = typeof WebAssembly.compile === 'function';
    } catch (e) { out.moduleApiError = e && e.name ? e.name : 'error'; }
    return out;
  }

  function svgProbe() {
    var out = {};
    try {
      var svgEl = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.setAttribute('width', '10');
      svgEl.setAttribute('height', '10');
      d.body.appendChild(svgEl);
      var rect = d.createElementNS('http://www.w3.org/2000/svg', 'rect');
      svgEl.appendChild(rect);
      var bbox = rect.getBBox();
      out.getBBox = bbox ? { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height } : null;
      try {
        var ctm = rect.getScreenCTM();
        out.getScreenCTM = ctm ? { a: ctm.a, d: ctm.d, e: ctm.e, f: ctm.f } : null;
      } catch (e) { out.getScreenCTM = null; }
      d.body.removeChild(svgEl);
    } catch (e) {
      out.error = e && e.name ? e.name : 'error';
    }
    return out;
  }

  function domrectProbe() {
    var out = {};
    try {
      out.fromRectSupported = typeof DOMRect.fromRect === 'function';
      var rect = DOMRect.fromRect({ x: 1, y: 2, width: 3, height: 4 });
      out.fromRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      var toJson = rect.toJSON ? rect.toJSON() : null;
      out.toJsonKeys = toJson ? Object.keys(toJson).sort() : null;
    } catch (e) { out.error = e && e.name ? e.name : 'error'; }
    try {
      out.elementGetClientRects = (function () {
        var el = d.createElement('span');
        el.textContent = 'fp';
        d.body.appendChild(el);
        var rects = el.getClientRects();
        d.body.removeChild(el);
        return rects && rects.length > 0 ? { count: rects.length, hasX: 'x' in rects[0] } : null;
      })();
    } catch (e) { out.elementGetClientRects = null; }
    return out;
  }

  function textmetricsProbe() {
    var c = d.createElement('canvas');
    c.width = 400;
    c.height = 20;
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    ctx.font = '12px sans-serif';
    var out = {};
    var samples = {
      baseline: 'mmmmmmmmmmlli',
      zeroWidth: 'a​b',
      emoji: 'a\uD83D\uDE00b',
      spaces: 'a    b',
      ligature: 'ffi'
    };
    Object.keys(samples).forEach(function (k) {
      try {
        out[k] = ctx.measureText(samples[k]).width.toFixed(3);
      } catch (e) { out[k] = null; }
    });
    return out;
  }

  function emojiProbe() {
    var c = d.createElement('canvas');
    c.width = 120;
    c.height = 40;
    var ctx = c.getContext('2d');
    if (!ctx) { return null; }
    ctx.font = '24px sans-serif';
    ctx.fillText('\uD83D\uDE00\uD83D\uDE03\u2764\uFE0F', 4, 28);
    return c.toDataURL();
  }

  function voicesProbe() {
    var out = { supported: 'speechSynthesis' in w };
    if (!out.supported) { return out; }
    try {
      var voices = w.speechSynthesis.getVoices() || [];
      out.count = voices.length;
      out.list = voices.slice(0, 60).map(function (v) {
        return v.name + ':' + v.lang + ':' + (v.localService ? 'local' : 'remote');
      });
      out.default = !!voices.length;
    } catch (e) { out.error = e && e.name ? e.name : 'error'; }
    return out;
  }

  // ============================================================
  // 第二层 deepProbes
  // ============================================================

  // ---------- lies.queryLies ----------
  // \s 匹配跨行空白：Firefox 的 native code 输出为多行格式
  var NATIVE_TOSTRING_PATTERNS = [
    /^function [\w$]+\(\) \{\s*\[native code\]\s*\}$/,
    /^function [\w$]+\(.*\) \{\s*\[native code\]\s*\}$/,
    /^function \(\) \{\s*\[native code\]\s*\}$/,
    /^function \(.*\) \{\s*\[native code\]\s*\}$/,
    /^function get [\w$]+\(\) \{\s*\[native code\]\s*\}$/,
    /^function set [\w$]+\(.*\) \{\s*\[native code\]\s*\}$/,
    /^\[object \w+\]$/
  ];

  function checkFunction(fn) {
    var failures = [];
    if (typeof fn !== 'function') {
      // 对象型接口（如 Math）不做函数级检查，跳过不计失败
      return null;
    }
    try {
      var str = Function.prototype.toString.call(fn);
      var matched = NATIVE_TOSTRING_PATTERNS.some(function (re) { return re.test(str); });
      if (!matched) {
        failures.push({ check: 'toStringFormat', pass: false, detail: str.slice(0, 80) });
      }
    } catch (e) {
      failures.push({ check: 'toStringFormat', pass: false, detail: 'throws:' + (e.name || 'error') });
    }
    // ownProps 严格检查只对非构造器：构造器（有 prototype，含 Function 自身的函数型 prototype）
    // 天然携带静态成员（Date.UTC / WebGL 常量 / Firefox parseHTML 等），其静态面由 prototypeLies hashMini 采集
    if (!fn.prototype) {
      try {
        var names = Object.getOwnPropertyNames(fn).sort();
        var allowed = ['length', 'name'].sort();
        if (JSON.stringify(names) !== JSON.stringify(allowed)) {
          failures.push({ check: 'ownProps', pass: false, detail: JSON.stringify(names) });
        }
      } catch (e) {
        failures.push({ check: 'ownProps', pass: false, detail: 'throws:' + (e.name || 'error') });
      }
    }
    try {
      if (Object.getOwnPropertyDescriptor(fn, 'arguments')) {
        failures.push({ check: 'argumentsOwnDescriptor', pass: false, detail: 'present' });
      }
    } catch (e) { /* 读取失败不计 */ }
    try {
      if (Object.getOwnPropertyDescriptor(fn, 'caller')) {
        failures.push({ check: 'callerOwnDescriptor', pass: false, detail: 'present' });
      }
    } catch (e) { /* 读取失败不计 */ }
    try {
      if (fn.prototype && typeof fn.prototype === 'object') {
        if (fn.prototype.constructor !== fn) {
          failures.push({ check: 'prototypeConstructor', pass: false, detail: 'mismatch' });
        }
      }
    } catch (e) { /* 跳过 */ }
    try {
      Object.create(fn).toString();
      failures.push({ check: 'createToStringNoThrow', pass: false, detail: 'no-throw' });
    } catch (e) {
      // 必须抛错；栈内容仅 Blink 可稳定校验（Firefox 栈格式随版本变化）
      if (!/Firefox\//.test(n.userAgent)) {
        var stack = e.stack || '';
        var engineOk = /Function\.toString/.test(stack) || /Object\.toString/.test(stack);
        if (!engineOk) {
          failures.push({ check: 'createToStringStack', pass: false, detail: String(e.stack || e).slice(0, 120) });
        }
      }
    }
    return failures.length ? failures : null;
  }

  function queryLiesProbe() {
    var interfaces = [
      { name: 'Function', fn: Function, samples: ['toString', 'apply', 'call', 'bind'] },
      { name: 'Math', fn: Math, samples: ['floor', 'random', 'acos'] },
      { name: 'Date', fn: Date, samples: ['now', 'parse', 'UTC'] },
      { name: 'Navigator', fn: n.constructor, samples: ['userAgent', 'languages', 'platform', 'hardwareConcurrency', 'webdriver'] },
      { name: 'Screen', fn: w.screen ? w.screen.constructor : null, samples: ['width', 'height', 'colorDepth'] },
      { name: 'HTMLCanvasElement', fn: d.createElement('canvas').constructor, samples: ['getContext', 'toDataURL'] },
      { name: 'CanvasRenderingContext2D', fn: null, samples: ['fillRect', 'measureText', 'getImageData'] },
      { name: 'WebGLRenderingContext', fn: null, samples: ['getParameter', 'getExtension'] },
      { name: 'Document', fn: Document, samples: ['createElement', 'getElementById', 'hasFocus'] },
      { name: 'CSSStyleDeclaration', fn: d.createElement('div').style.constructor, samples: ['setProperty', 'getPropertyValue'] }
    ];
    try {
      var cctx = d.createElement('canvas').getContext('2d');
      if (cctx) { interfaces[6].fn = cctx.constructor; }
    } catch (e) { /* 忽略 */ }
    try {
      var gctx = d.createElement('canvas').getContext('webgl');
      if (gctx) { interfaces[7].fn = gctx.constructor; }
    } catch (e) { /* 忽略 */ }

    var results = {};
    var totalChecked = 0;
    interfaces.forEach(function (iface) {
      var entry = { checked: 0, failures: [] };
      if (iface.fn) {
        var ctorFailures = checkFunction(iface.fn);
        entry.checked += 1;
        if (ctorFailures) { entry.failures = entry.failures.concat(ctorFailures); }
      } else {
        entry.failures.push({ check: 'constructor', pass: false, detail: 'missing' });
      }
      iface.samples.forEach(function (prop) {
        var proto = iface.fn ? iface.fn.prototype : null;
        if (!proto) { return; }
        var method = null;
        try {
          method = typeof proto[prop] === 'function' ? proto[prop] : null;
          if (!method) {
            var desc = Object.getOwnPropertyDescriptor(proto, prop);
            if (desc && typeof desc.get === 'function') { method = desc.get; }
          }
        } catch (e) { method = null; }
        if (method) {
          entry.checked += 1;
          var fnFailures = checkFunction(method);
          if (fnFailures) { entry.failures = entry.failures.concat(fnFailures); }
        }
      });
      totalChecked += entry.checked;
      results[iface.name] = entry;
    });
    return { totalChecked: totalChecked, interfaces: results };
  }

  // ---------- lies.prototypeLies ----------
  var PROTOTYPE_INTERFACES = [
    'Function', 'Math', 'Date', 'Navigator', 'Screen', 'SpeechSynthesis',
    'CanvasRenderingContext2D', 'WebGLRenderingContext', 'WebGL2RenderingContext',
    'AudioBuffer', 'AnalyserNode', 'DOMRect', 'SVGRect', 'Element', 'HTMLElement',
    'HTMLIFrameElement', 'Document', 'Intl.DateTimeFormat', 'Intl.Collator',
    'Intl.DisplayNames', 'Intl.RelativeTimeFormat', 'MediaDevices', 'Permissions',
    'StorageManager', 'OffscreenCanvas', 'History', 'Location', 'Performance',
    'PerformanceNavigation', 'XMLHttpRequest', 'Response', 'Request', 'Headers',
    'URL', 'URLSearchParams', 'WebSocket', 'EventTarget', 'CustomEvent', 'Node',
    'HTMLBodyElement', 'HTMLDivElement', 'MutationObserver', 'ResizeObserver',
    'IntersectionObserver', 'Crypto', 'SubtleCrypto', 'TextEncoder', 'TextDecoder',
    'MessageChannel', 'ImageData'
  ];

  function prototypeLiesProbe() {
    var results = [];
    var interfaceCount = 0;
    var anomalies = [];
    PROTOTYPE_INTERFACES.forEach(function (name) {
      try {
        var root = name.split('.').reduce(function (acc, part) {
          return acc ? acc[part] : null;
        }, w);
        if (!root) { return; }
        var proto = root.prototype;
        if (!proto) { return; }
        interfaceCount += 1;
        var layers = [];
        var seen = {};
        var cursor = proto;
        var depth = 0;
        while (cursor && depth < 8 && typeof cursor === 'object') {
          var props = Object.getOwnPropertyNames(cursor);
          props.forEach(function (p) { seen[p] = true; });
          layers.push({ depth: depth, names: props });
          var next = Object.getPrototypeOf(cursor);
          if (!next || next === cursor) { break; }
          cursor = next;
          depth += 1;
        }
        var allNames = Object.keys(seen).sort();
        results.push({
          name: name,
          layers: layers.length,
          propCount: allNames.length,
          hashMini: fnvHash(allNames.join(',')),
          constructorMatch: proto.constructor === root
        });
        if (proto.constructor !== root) {
          anomalies.push({ api: name, issue: 'constructor-mismatch' });
        }
        if (allNames.some(function (p) { return p === '' || p.indexOf('\0') >= 0; })) {
          anomalies.push({ api: name, issue: 'empty-or-null-prop' });
        }
      } catch (e) {
        anomalies.push({ api: name, issue: 'throws:' + (e.name || 'error') });
      }
    });
    return {
      checkedInterfaces: interfaceCount,
      interfaces: results,
      anomalies: anomalies.slice(0, 50),
      extensionHashMatch: null
    };
  }

  // ---------- lies.phantomIframe ----------
  function phantomIframeProbe() {
    return new Promise(function (resolve) {
      var frame = d.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:10px;height:10px;visibility:hidden;';
      frame.srcdoc = '<!doctype html><html><head></head><body></body></html>';
      var done = false;
      function finish(value) {
        if (done) { return; }
        done = true;
        if (frame.parentNode) { frame.parentNode.removeChild(frame); }
        resolve(value);
      }
      frame.onload = function () {
        try {
          var cw = frame.contentWindow;
          var cn = cw.navigator;
          var cs = cw.screen;
          var diff = [];
          var compared = 0;
          function cmp(prop, mainVal, phantomVal) {
            compared += 1;
            var mv = mainVal === undefined ? null : mainVal;
            var pv = phantomVal === undefined ? null : phantomVal;
            if (JSON.stringify(mv) !== JSON.stringify(pv)) {
              diff.push({ prop: prop, main: mv, phantom: pv });
            }
          }
          cmp('webdriver', n.webdriver, cn.webdriver);
          cmp('language', n.language, cn.language);
          cmp('platform', n.platform, cn.platform);
          cmp('vendor', n.vendor, cn.vendor);
          cmp('maxTouchPoints', n.maxTouchPoints, cn.maxTouchPoints);
          cmp('deviceMemory', n.deviceMemory, cn.deviceMemory);
          cmp('hardwareConcurrency', n.hardwareConcurrency, cn.hardwareConcurrency);
          cmp('colorDepth', w.screen.colorDepth, cs.colorDepth);
          cmp('timezoneOffset', new Date().getTimezoneOffset(), new cw.Date().getTimezoneOffset());
          cmp('pluginsCount', n.plugins ? n.plugins.length : null, cn.plugins ? cn.plugins.length : null);
          cmp('userAgent', n.userAgent, cn.userAgent);
          cmp('languageTag', n.languages ? n.languages.join(',') : null, cn.languages ? cn.languages.join(',') : null);
          finish({ compared: compared, diff: diff.slice(0, 30) });
        } catch (e) {
          finish({ compared: 0, diff: [], error: e && e.name ? e.name : 'cross-origin' });
        }
      };
      frame.onerror = function () { finish({ compared: 0, diff: [], error: 'load-error' }); };
      d.body.appendChild(frame);
      setTimeout(function () { finish({ compared: 0, diff: [], error: 'timeout' }); }, 2500);
    });
  }

  // ---------- lies.stability ----------
  function canvasPixelDiff(c1, c2) {
    var ctx1 = c1.getContext('2d');
    var ctx2 = c2.getContext('2d');
    var img1 = ctx1.getImageData(0, 0, c1.width, c1.height);
    var img2 = ctx2.getImageData(0, 0, c2.width, c2.height);
    if (img1.data.length !== img2.data.length) { return { pass: false, diffPixels: -1 }; }
    var diff = 0;
    for (var i = 0; i < img1.data.length; i += 4) {
      if (img1.data[i] !== img2.data[i] || img1.data[i + 1] !== img2.data[i + 1] ||
        img1.data[i + 2] !== img2.data[i + 2] || img1.data[i + 3] !== img2.data[i + 3]) {
        diff += 1;
      }
    }
    return { pass: diff === 0, diffPixels: diff };
  }

  function stabilityProbe() {
    var out = {};
    try {
      var c1 = d.createElement('canvas');
      c1.width = 220;
      c1.height = 60;
      var ctx1 = c1.getContext('2d');
      canvasBaseDraw(ctx1);
      var first = c1.toDataURL();
      canvasBaseDraw(ctx1);
      var second = c1.toDataURL();
      var c2 = d.createElement('canvas');
      c2.width = 220;
      c2.height = 60;
      canvasBaseDraw(c2.getContext('2d'));
      out.canvasSameElement = { pass: first === second };
      out.canvasRecreated = canvasPixelDiff(c1, c2);
    } catch (e) {
      out.canvasError = e && e.name ? e.name : 'error';
    }
    var mathCases = [
      { name: 'acos0.5', actual: Math.acos(0.5), expected: 1.0471975511965979 },
      { name: 'asin1', actual: Math.asin(1), expected: 1.5707963267948966 },
      { name: 'atan2_1_1', actual: Math.atan2(1, 1), expected: 0.7853981633974483 },
      { name: 'sqrt2', actual: Math.sqrt(2), expected: 1.4142135623730951 },
      { name: 'log2', actual: Math.log(2), expected: 0.6931471805599453 },
      { name: 'exp1', actual: Math.exp(1), expected: 2.718281828459045 },
      { name: 'pow2_10', actual: Math.pow(2, 10), expected: 1024 },
      { name: 'sin0', actual: Math.sin(0), expected: 0 },
      { name: 'acos2_nan', actual: Math.acos(2), expectedIsNaN: true },
      { name: 'sqrtNeg_nan', actual: Math.sqrt(-1), expectedIsNaN: true }
    ];
    out.mathCases = mathCases.map(function (mc) {
      var pass;
      if (mc.expectedIsNaN) {
        pass = Number.isNaN(mc.actual);
      } else {
        pass = Math.abs(mc.actual - mc.expected) < 1e-12;
      }
      return { name: mc.name, pass: pass };
    });
    out.mathPass = out.mathCases.every(function (m) { return m.pass; });
    return audioProbe().then(function (firstAudio) {
      return audioProbe().then(function (secondAudio) {
        out.audioStable = JSON.stringify(firstAudio) === JSON.stringify(secondAudio);
        out.audioWaveHash = firstAudio && firstAudio.waveHash ? firstAudio.waveHash : null;
        return out;
      });
    });
  }

  // ---------- lies.crossValidation ----------
  function crossValidationProbe() {
    var out = {};
    try {
      var plugins = n.plugins || [];
      var mimeTypes = n.mimeTypes || [];
      var globalMimeSet = {};
      for (var i = 0; i < mimeTypes.length; i++) {
        globalMimeSet[mimeTypes[i].type] = true;
      }
      var pluginIssues = [];
      for (var j = 0; j < plugins.length; j++) {
        var plugin = plugins[j];
        var firstMime = plugin[0];
        if (firstMime) {
          if (Object.getPrototypeOf(firstMime) !== MimeType.prototype) {
            pluginIssues.push({ plugin: plugin.name, issue: 'first-element-not-MimeType' });
          }
          var hasGlobalOverlap = false;
          for (var k = 0; k < plugin.length; k++) {
            if (globalMimeSet[plugin[k].type] === true) {
              hasGlobalOverlap = true;
              break;
            }
          }
          if (!hasGlobalOverlap) {
            pluginIssues.push({ plugin: plugin.name, issue: 'no-global-mimetype-overlap' });
          }
        }
        var enabled = firstMime && firstMime.enabledPlugin;
        if (enabled && enabled.name !== plugin.name) {
          pluginIssues.push({ plugin: plugin.name, issue: 'enabledPlugin-mismatch' });
        }
      }
      out.pass = pluginIssues.length === 0;
      out.issues = pluginIssues.slice(0, 20);
      out.counts = { plugins: plugins.length, mimeTypes: mimeTypes.length };
    } catch (e) {
      out.error = e && e.name ? e.name : 'error';
    }
    return out;
  }

  // ---------- trash ----------
  var GIBBERS_PATTERNS = [
    /[cC]f/,
    /[jJ][bcdfghlmprsty]/,
    /[qQ][bcfghjklmnpqrstvwxyz]/,
    /[vV][bcdfghjklmnpqrstvwxyz]/,
    /[xX][bdfgjkmnqrvxz]/,
    /[zZ][bcdfghjklmnpqrstvwxz]/
  ];
  var GIBBERS_ALLOWLIST = ['cf', 'bf', 'fx', 'mx', 'xz'];

  function gibberish(text) {
    if (!text || typeof text !== 'string') { return { hit: false }; }
    var hits = [];
    GIBBERS_PATTERNS.forEach(function (re, idx) {
      var m = re.exec(text);
      while (m) {
        var token = m[0];
        var blocked = GIBBERS_ALLOWLIST.some(function (a) { return text.toLowerCase().indexOf(a) >= 0; });
        if (!blocked) {
          hits.push({ patternId: idx, token: token });
          break;
        }
        m = re.exec(text);
      }
    });
    var caseSeq = text.match(/[A-Z]{3,}[a-z]|[a-z][A-Z]{3,}/);
    if (caseSeq) { hits.push({ patternId: 'case', token: caseSeq[0] }); }
    var alnumSeq = text.match(/[a-zA-Z]\d[a-zA-Z]\d/);
    if (alnumSeq) { hits.push({ patternId: 'alnum', token: alnumSeq[0] }); }
    return { hit: hits.length > 0, hits: hits.slice(0, 10) };
  }

  var RENDERER_BRANDS = ['NVIDIA', 'GeForce', 'RTX', 'GTX', 'Quadro', 'AMD', 'Radeon',
    'Intel', 'Iris', 'UHD Graphics', 'Apple', 'Qualcomm', 'Adreno',
    'Mali', 'PowerVR', 'Imagination', 'SwiftShader', 'Microsoft Basic Render', 'Mesa',
    'llvmpipe', 'ANGLE', 'Direct3D', 'Vulkan', 'Metal', 'OpenGL'];

  function trashProbe() {
    var out = { checks: [] };
    var uaResult = gibberish(n.userAgent);
    if (uaResult.hit) { out.checks.push({ field: 'userAgent', gibberish: uaResult }); }
    try {
      var pluginNames = Array.prototype.slice.call(n.plugins || []).map(function (p) { return p.name; });
      pluginNames.forEach(function (name) {
        var r = gibberish(name);
        if (r.hit) { out.checks.push({ field: 'pluginName', value: name, gibberish: r }); }
      });
    } catch (e) { /* 忽略 */ }
    try {
      var gl = d.createElement('canvas').getContext('webgl');
      var renderer = null;
      if (gl) {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) { renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); }
      }
      if (renderer) {
        var brandCount = RENDERER_BRANDS.filter(function (b) { return renderer.indexOf(b) >= 0; }).length;
        var whiteSpaceNoise = (renderer.match(/\s{2,}/g) || []).length;
        var hasAngleStructure = renderer.indexOf('ANGLE') >= 0;
        var gib = gibberish(renderer);
        var grade;
        if (brandCount >= 1 && whiteSpaceNoise === 0 && !gib.hit) { grade = 'A'; }
        else if (brandCount >= 1 || hasAngleStructure) { grade = 'C'; }
        else { grade = 'F'; }
        out.rendererGrade = grade;
        out.rendererBrandCount = brandCount;
        if (grade === 'F' || gib.hit) { out.checks.push({ field: 'renderer', gibberish: gib, grade: grade }); }
      }
    } catch (e) { /* 忽略 */ }
    return out;
  }

  // ---------- resistance ----------
  function timerPrecisionProbe() {
    return new Promise(function (resolve) {
      var lastDigits = [];
      function sample() {
        lastDigits.push(Date.now() % 10);
        if (lastDigits.length >= 10) {
          var allSame = lastDigits.every(function (x) { return x === lastDigits[0]; });
          resolve({ allSame: allSame, digits: lastDigits.slice(0, 10) });
        } else {
          setTimeout(sample, lastDigits.length * 2 + 1);
        }
      }
      sample();
    });
  }

  function resistanceProbe() {
    var out = {};
    out.brave = false;
    try {
      if (n.brave && typeof n.brave.isBrave === 'function') {
        out.brave = { detected: true, name: n.brave.isBrave.name || '' };
      } else if (typeof n.brave !== 'undefined') {
        out.brave = { detected: true, shape: typeof n.brave };
      }
    } catch (e) { out.brave = { detected: false }; }
    out.rfpIndicators = {
      maxTouchPointsZero: n.maxTouchPoints === 0,
      deviceMemoryUndefined: typeof n.deviceMemory === 'undefined',
      hardwareConcurrencyFixed: n.hardwareConcurrency === 2,
      timezonePrecisionLoss: (function () {
        try {
          var t1 = new Date(2025, 0, 1).getTimezoneOffset();
          var t2 = new Date(2025, 5, 1).getTimezoneOffset();
          return t1 === t2;
        } catch (e) { return null; }
      })(),
      screenStepHundred: w.screen.width % 100 === 0 && w.screen.height % 100 === 0,
      innerStepHundred: w.innerWidth % 100 === 0 && w.innerHeight % 100 === 0
    };
    out.rfpScore = ['maxTouchPointsZero', 'deviceMemoryUndefined', 'hardwareConcurrencyFixed',
      'timezonePrecisionLoss', 'screenStepHundred', 'innerStepHundred'].filter(function (k) {
        return out.rfpIndicators[k] === true;
      }).length;
    out.torIndicators = {
      noPlugins: (function () {
        try { return (n.plugins || []).length === 0; } catch (e) { return null; }
      })(),
      roundedResolution: w.screen.width % 200 === 0,
      utcTimezone: new Date().getTimezoneOffset() === 0
    };
    out.torScore = ['noPlugins', 'roundedResolution', 'utcTimezone'].filter(function (k) {
      return out.torIndicators[k] === true;
    }).length;
    return out;
  }

  // ============================================================
  // 采集执行
  // ============================================================

  safeSync('navigator', navigatorProbe);
  safeSync('screen', screenProbe);
  safeSync('viewport', viewportProbe);
  safeSync('webgl', function () { return webglProbe('webgl'); });
  safeSync('webgl2', function () { return webglProbe('webgl2'); });
  safeSync('offscreen', offscreenProbe);
  safeSync('timing', timingProbe);
  safeSync('matchMedia', matchMediaProbe);
  safeSync('cssom', cssomProbe);
  safeSync('storage', storageProbe);
  safeSync('intl', intlProbe);
  safeSync('fonts', fontsProbe);
  safeSync('apiSurface', apiSurfaceProbe);
  safeSync('prototypeProbes', prototypeProbes);
  safeSync('pluginsDeep', pluginsDeepProbe);
  safeSync('fontsMeasure', fontsMeasureProbe);
  safeSync('automationFlags', automationFlagsProbe);
  safeSync('timingDeep', timingDeepProbe);
  safeSync('webrtc', webrtcProbe);
  safeSync('cookieHistory', cookieHistoryProbe);
  safeSync('media', mediaProbe);
  safeSync('wasm', wasmProbe);
  safeSync('svg', svgProbe);
  safeSync('domrect', domrectProbe);
  safeSync('textmetrics', textmetricsProbe);
  safeSync('voices', voicesProbe);

  try {
    var canvas1 = canvasToDataUrl(220, 60, canvasBaseDraw);
    var canvas2 = canvasToDataUrl(32, 32, canvasAltDraw);
    components.canvas = {
      base: { width: 220, height: 60, hash: await sha256Hex(canvas1) },
      alt: { width: 32, height: 32, hash: await sha256Hex(canvas2) }
    };
  } catch (e) {
    components.canvas = null;
    errors.push('canvas:' + (e && e.name ? e.name : 'error'));
  }

  try {
    var emojiDataUrl = emojiProbe();
    components.emoji = { hash: await sha256Hex(emojiDataUrl) };
  } catch (e) {
    components.emoji = null;
    errors.push('emoji:' + (e && e.name ? e.name : 'error'));
  }

  try { components.audio = await withTimeout(audioProbe(), 3000); }
  catch (e) { asyncError('audio', e); }

  try { components.iframeRealm = await withTimeout(iframeRealmProbe(), 3000); }
  catch (e) { asyncError('iframeRealm', e); }

  try { components.worker = await withTimeout(workerProbe(), 3000); }
  catch (e) { asyncError('worker', e); }

  try { components.iframeRealmDeep = await withTimeout(iframeRealmDeepProbe(), 3000); }
  catch (e) { asyncError('iframeRealmDeep', e); }

  try { deepProbes.lies.queryLies = queryLiesProbe(); }
  catch (e) { probeError('lies', 'queryLies', e); }
  try { deepProbes.lies.prototypeLies = prototypeLiesProbe(); }
  catch (e) { probeError('lies', 'prototypeLies', e); }
  try { deepProbes.lies.crossValidation = crossValidationProbe(); }
  catch (e) { probeError('lies', 'crossValidation', e); }
  try { deepProbes.trash = trashProbe(); }
  catch (e) { probeError('trash', 'trash', e); }
  try { deepProbes.resistance = resistanceProbe(); }
  catch (e) { probeError('resistance', 'resistance', e); }

  try { deepProbes.lies.phantomIframe = await withTimeout(phantomIframeProbe(), 4000); }
  catch (e) { probeError('lies', 'phantomIframe', e); }

  try { deepProbes.lies.stability = await withTimeout(stabilityProbe(), 6000); }
  catch (e) { probeError('lies', 'stability', e); }

  try {
    var precision = await withTimeout(timerPrecisionProbe(), 3000);
    deepProbes.resistance.timerPrecision = precision;
  } catch (e) { probeError('resistance', 'timerPrecision', e); }

  // ============================================================
  // 第三层 组装上报
  // ============================================================
  var STABLE_KEYS = ['navigator', 'screen', 'viewport', 'canvas', 'emoji', 'webgl', 'webgl2',
    'offscreen', 'intl', 'fonts', 'cssom', 'matchMedia', 'apiSurface', 'prototypeProbes',
    'pluginsDeep', 'fontsMeasure', 'automationFlags', 'webrtc', 'wasm', 'svg', 'domrect',
    'textmetrics', 'voices'];
  var stable = {};
  STABLE_KEYS.forEach(function (k) { stable[k] = components[k]; });
  var visitorId = await sha256Hex(canonicalJson(stable));

  var payload = {
    script: SCRIPT,
    kind: 'environment',
    collectedAt: new Date().toISOString(),
    visitorId: visitorId,
    components: components,
    deepProbes: deepProbes,
    errors: errors,
    durationMs: Math.round(nowMs() - t0)
  };

  if (typeof w.__fp_submit === 'function') {
    w.__fp_submit(payload);
  }
})();
