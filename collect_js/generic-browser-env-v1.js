/* generic-browser-env-v1 通用浏览器环境指纹基线模板
 * 维度对齐 radwell 项目 DataDome 环境面研究；设计参考 FingerprintJS v5 (MIT)。
 * 契约：最终调用 window.__fp_submit(payload) 上报；Canvas/音频只采集哈希，不存原始 data URL。
 * 注意：本脚本被内联进 <script> 块，源码中不得出现 "</" + "script" 字面量。
 */
(async function () {
  'use strict';

  var SCRIPT = 'generic-browser-env-v1';
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
    // 降级：FNV-1a 32 位
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

  // ---------- A. navigator（同步，20+ 字段） ----------
  function navigatorProbe() {
    var out = {};
    var props = ['userAgent', 'platform', 'language', 'cookieEnabled', 'webdriver',
      'hardwareConcurrency', 'maxTouchPoints', 'onLine', 'vendor', 'vendorSub',
      'product', 'productSub', 'appCodeName', 'appName', 'appVersion', 'doNotTrack',
      'pdfViewerEnabled'];
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
    var props = ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth'];
    props.forEach(function (p) {
      try { out[p] = s[p]; } catch (e) { out[p] = null; }
    });
    try { out.orientation = s.orientation ? s.orientation.type : null; } catch (e) { out.orientation = null; }
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
      screenY: w.screenY
    };
  }

  // ---------- C. Canvas 2D（只存 hash） ----------
  function canvasToDataUrl() {
    var c = d.createElement('canvas');
    c.width = 220;
    c.height = 60;
    var ctx = c.getContext('2d');
    if (!ctx) { throw new Error('no-2d-context'); }
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
    return c.toDataURL();
  }

  // ---------- D. WebGL / WebGL2 ----------
  function webglProbe(kind) {
    var c = d.createElement('canvas');
    var gl = null;
    try { gl = c.getContext(kind); } catch (e) { gl = null; }
    if (!gl) { return null; }
    var out = {};
    var params = ['VENDOR', 'RENDERER', 'VERSION', 'SHADING_LANGUAGE_VERSION',
      'MAX_TEXTURE_SIZE', 'MAX_VIEWPORT_DIMS', 'MAX_RENDERBUFFER_SIZE'];
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

  // ---------- F. AudioContext / OfflineAudioContext（异步，只存 hash） ----------
  function audioProbe() {
    var out = {};
    var AC = w.AudioContext || w.webkitAudioContext;
    if (AC) {
      var ctx = new AC();
      out.sampleRate = ctx.sampleRate;
      out.state = ctx.state;
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

  // ---------- G. Navigation Timing ----------
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

  // ---------- I. CSSOM 探测 ----------
  function cssomProbe() {
    var out = {};
    try { out.focusWithinSupported = w.CSS && w.CSS.supports ? w.CSS.supports(':focus-within', 'display:none') : null; }
    catch (e) { out.focusWithinSupported = null; }
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

  // ---------- J. iframe realm（异步，2s 超时） ----------
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

  // ---------- K. storage 读写往返 ----------
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

  // ---------- L. Blob Worker 往返（异步，2s 超时） ----------
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
    return out;
  }

  // ---------- N. 字体简单探测 ----------
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

  // 异步维度（带 3s 超时保护）
  try {
    var canvasDataUrl = canvasToDataUrl();
    var canvasHash = await sha256Hex(canvasDataUrl);
    components.canvas = { width: 220, height: 60, hash: canvasHash };
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

  // ---------- visitorId：稳定子集哈希（内部对照用，非稳定唯一标识） ----------
  var STABLE_KEYS = ['navigator', 'screen', 'viewport', 'canvas', 'webgl', 'webgl2',
    'offscreen', 'intl', 'fonts', 'cssom', 'matchMedia'];
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
