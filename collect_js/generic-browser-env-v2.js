/* generic-browser-env-v2 通用浏览器环境指纹基线模板（扩充版）
 * 在 v1 的 16 组件基础上扩充深度探测面，对齐 radwell DataDome 环境面研究
 * （browser 189 / local 152 终端的探测分类：原型行为、plugins 深度、字体测量、
 *   automation flags、WebRTC、API 表面、timing 全字段、iframe realm 深度等）。
 * 契约：最终调用 window.__fp_submit(payload)；Canvas/音频只存哈希。
 * 注意：本脚本被内联进 <script> 块，源码中不得出现 "</" + "script" 字面量。
 */
(async function () {
  'use strict';

  var SCRIPT = 'generic-browser-env-v2';
  var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var w = window;
  var d = document;
  var n = w.navigator;
  var errors = [];
  var components = {};

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

  // ---------- A. navigator（20+ 字段） ----------
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

  // ---------- B. screen / viewport ----------
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

  // ---------- C. Canvas 2D（双画布 hash） ----------
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

  // ---------- D. WebGL / WebGL2 ----------
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

  // ---------- E. OffscreenCanvas ----------
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

  // ---------- F. Audio（只存 hash） ----------
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

  // ---------- G. Navigation Timing（浅） ----------
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

  // ---------- H. matchMedia ----------
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

  // ---------- I. CSSOM ----------
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

  // ---------- J. iframe realm（异步） ----------
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

  // ---------- K. storage ----------
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

  // ---------- L. Blob Worker（异步） ----------
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

  // ---------- M. Intl / 时区 ----------
  function intlProbe() {
    var out = {};
    try {
      var resolved = Intl.DateTimeFormat().resolvedOptions();
      out.timeZone = resolved.timeZone;
      out.calendar = resolved.calendar;
      out.numberingSystem = resolved.numberingSystem;
    } catch (e) { out.resolvedError = e && e.name ? e.name : 'error'; }
    try { out.timezoneOffset = new Date().getTimezoneOffset(); } catch (e) { out.timezoneOffset = null; }
    try { out.locale = Intl.DateTimeFormat().resolvedOptions().locale; } catch (e) { out.locale = null; }
    return out;
  }

  // ---------- N. 字体（check 布尔） ----------
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

  // ---------- O. API 表面矩阵（v2 新增） ----------
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
    try {
      out.pluginsRefreshFn = typeof n.plugins.refresh === 'function';
    } catch (e) { out.pluginsRefreshFn = null; }
    return out;
  }

  // ---------- P. 原型与行为探测（v2 新增，对齐 DataDome hasFocus/setProperty 探测） ----------
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

  // ---------- Q. plugins 深度行为（v2 新增） ----------
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

  // ---------- R. 字体测量（v2 新增，measureText 宽度模式） ----------
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

  // ---------- S. automation flags（v2 新增） ----------
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

  // ---------- T. timing 深度（v2 新增，全字段） ----------
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

  // ---------- U. WebRTC（v2 新增） ----------
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

  // ---------- V. iframe realm 深度（v2 新增，异步） ----------
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

  // ---------- W. cookie / history / 窗口关系（v2 新增） ----------
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

  // ---------- X. 媒体与合成能力（v2 新增） ----------
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
      out.sourceBuffer = (typeof w.MediaSource !== 'undefined');
    } catch (e) { out.mediaSource = null; }
    return out;
  }

  // ---------- 采集执行 ----------
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
  // v2 新增同步维度
  safeSync('apiSurface', apiSurfaceProbe);
  safeSync('prototypeProbes', prototypeProbes);
  safeSync('pluginsDeep', pluginsDeepProbe);
  safeSync('fontsMeasure', fontsMeasureProbe);
  safeSync('automationFlags', automationFlagsProbe);
  safeSync('timingDeep', timingDeepProbe);
  safeSync('webrtc', webrtcProbe);
  safeSync('cookieHistory', cookieHistoryProbe);
  safeSync('media', mediaProbe);

  // 异步维度（带 3s 超时保护）
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

  try { components.audio = await withTimeout(audioProbe(), 3000); }
  catch (e) { asyncError('audio', e); }

  try { components.iframeRealm = await withTimeout(iframeRealmProbe(), 3000); }
  catch (e) { asyncError('iframeRealm', e); }

  try { components.worker = await withTimeout(workerProbe(), 3000); }
  catch (e) { asyncError('worker', e); }

  try { components.iframeRealmDeep = await withTimeout(iframeRealmDeepProbe(), 3000); }
  catch (e) { asyncError('iframeRealmDeep', e); }

  // ---------- visitorId：稳定子集哈希 ----------
  var STABLE_KEYS = ['navigator', 'screen', 'viewport', 'canvas', 'webgl', 'webgl2',
    'offscreen', 'intl', 'fonts', 'cssom', 'matchMedia', 'apiSurface', 'prototypeProbes',
    'pluginsDeep', 'fontsMeasure', 'automationFlags', 'webrtc'];
  var stable = {};
  STABLE_KEYS.forEach(function (k) { stable[k] = components[k]; });
  var visitorId = await sha256Hex(canonicalJson(stable));

  var payload = {
    script: SCRIPT,
    collectedAt: new Date().toISOString(),
    visitorId: visitorId,
    components: components,
    errors: errors,
    durationMs: Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0)
  };

  if (typeof w.__fp_submit === 'function') {
    w.__fp_submit(payload);
  }
})();
