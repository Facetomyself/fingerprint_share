/* zhipin-security-js-boss 采集模板
 * 专有探测面（通用面由 generic-deep-v3 覆盖，本条目聚焦 BOSS 直聘 security-js 设备指纹面）：
 *   - WebGL readPixels 行为（1x1 像素读取 hash）
 *   - 设备指纹字段组合形状（deviceMemory/hardwareConcurrency/pdfViewerEnabled 等）
 *   - console 序列化侧信道（console.log/table/error 的 descriptor 与 native 检测）
 *   - 输入事件面（compositionstart IME 支持、isTrusted 属性存在性）
 *   - 资源域名分组（当前页 performance entries 域名计数）
 * 来源：workspace/boss（security-js 到 __zp_stoken__ 链 + 设备指纹研究）。
 * 契约：调用 window.__fp_submit(payload)；不含 "</" + "script" 字面量。
 */
(async function () {
  'use strict';

  var SCRIPT = 'zhipin-security-js-boss';
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

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function safe(name, fn) {
    try {
      components[name] = fn();
    } catch (e) {
      components[name] = null;
      errors.push(name + ':' + (e && e.name ? e.name : 'error'));
    }
  }

  function nativeOf(fn) {
    try {
      return /\[native code\]/.test(Function.prototype.toString.call(fn));
    } catch (e) { return null; }
  }

  // ---------- WebGL readPixels 行为 ----------
  safe('webglReadPixels', function () {
    var c = d.createElement('canvas');
    c.width = 1;
    c.height = 1;
    var gl = c.getContext('webgl');
    if (!gl) { return null; }
    var pixels = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    var hash = '';
    for (var i = 0; i < 4; i++) {
      hash += ('0' + pixels[i].toString(16)).slice(-2);
    }
    return {
      pixelHash: hash,
      hasWebgl2: !!(c.getContext('webgl2')),
      readPixelsNative: nativeOf(WebGLRenderingContext.prototype.readPixels)
    };
  });

  // ---------- 设备指纹字段组合形状 ----------
  safe('deviceFingerprintShape', function () {
    return {
      deviceMemory: typeof n.deviceMemory !== 'undefined' ? n.deviceMemory : null,
      hardwareConcurrency: n.hardwareConcurrency,
      pdfViewerEnabled: n.pdfViewerEnabled,
      platform: n.platform,
      product: n.product,
      vendor: n.vendor,
      fieldOrder: ['deviceMemory', 'hardwareConcurrency', 'pdfViewerEnabled', 'platform', 'product', 'vendor']
    };
  });

  // ---------- console 序列化侧信道 ----------
  safe('consoleSideChannel', function () {
    var out = {};
    ['log', 'table', 'error', 'warn'].forEach(function (method) {
      try {
        var fn = w.console[method];
        out[method] = {
          type: typeof fn,
          native: nativeOf(fn),
          arity: fn ? fn.length : null
        };
      } catch (e) { out[method] = { error: e.name }; }
    });
    try {
      out.consoleOwnProps = Object.getOwnPropertyNames(w.console).length;
    } catch (e) { out.consoleOwnProps = null; }
    return out;
  });

  // ---------- 输入事件面 ----------
  safe('inputEventSurface', function () {
    var out = {};
    try {
      out.compositionSupported = 'oncompositionstart' in w;
      out.inputEventSupported = 'InputEvent' in w;
      out.isTrustedOnEvent = 'isTrusted' in new Event('x');
    } catch (e) { out.error = e.name; }
    try {
      out.pointerEventsSupported = 'PointerEvent' in w;
      out.mouseEventNative = nativeOf(w.MouseEvent);
    } catch (e) { out.mouseEventNative = null; }
    return out;
  });

  // ---------- 资源域名分组 ----------
  safe('resourceDomains', function () {
    var groups = {};
    var count = 0;
    try {
      var entries = performance.getEntriesByType('resource');
      count = entries.length;
      entries.forEach(function (entry) {
        try {
          var host = new URL(entry.name, location.href).hostname;
          groups[host] = (groups[host] || 0) + 1;
        } catch (e) { groups['unparsed'] = (groups['unparsed'] || 0) + 1; }
      });
    } catch (e) { groups = null; }
    return { resourceCount: count, domains: groups };
  });

  // ---------- 组装上报 ----------
  var STABLE_KEYS = ['webglReadPixels', 'deviceFingerprintShape', 'consoleSideChannel', 'inputEventSurface'];
  var stable = {};
  STABLE_KEYS.forEach(function (k) { stable[k] = components[k]; });
  var visitorId = await sha256Hex(JSON.stringify(stable));

  var payload = {
    script: SCRIPT,
    kind: 'environment',
    collectedAt: new Date().toISOString(),
    visitorId: visitorId,
    components: components,
    errors: errors,
    durationMs: Math.round(nowMs() - t0)
  };

  if (typeof w.__fp_submit === 'function') {
    w.__fp_submit(payload);
  }
})();
