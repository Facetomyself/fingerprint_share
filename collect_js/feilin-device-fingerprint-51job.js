/* feilin-device-fingerprint-51job 采集模板
 * 专有探测面（通用面由 generic-deep-v3 覆盖，本条目聚焦飞林 FeiLin v1.4.2 反调试/完整性面）：
 *   - toString 深度（Function.toString 的 toString、eval.toString 形状）
 *   - document.all 行为（浏览器真实性检测向量）
 *   - 扩展/篡改脚本检测（GM 前缀 / unsafeWindow / webpack 全局扫描）
 *   - 回调完整性（setTimeout/setInterval 的 descriptor 与覆写性）
 *   - 插件一致性（plugins 数 vs mimeTypes 数，飞林比对向量）
 *   - 飞林 SDK 全局变量形状
 * 来源：workspace/51job-web-reverse（ACW WAF + FeiLin v1.4.2 检测向量矩阵 V1-V7）。
 * 契约：调用 window.__fp_submit(payload)；不含 "</" + "script" 字面量。
 */
(async function () {
  'use strict';

  var SCRIPT = 'feilin-device-fingerprint-51job';
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

  // ---------- toString 深度 ----------
  safe('toStringDeep', function () {
    var out = {};
    try {
      out.toStringToString = Function.prototype.toString.call(Function.prototype.toString).slice(0, 80);
    } catch (e) { out.toStringToString = null; }
    try {
      out.evalToString = Function.prototype.toString.call(w.eval).slice(0, 80);
    } catch (e) { out.evalToString = null; }
    try {
      out.customFnToString = Function.prototype.toString.call(function customProbeName() { }).slice(0, 80);
    } catch (e) { out.customFnToString = null; }
    out.fnToStringNative = nativeOf(Function.prototype.toString);
    return out;
  });

  // ---------- document.all 行为 ----------
  safe('documentAll', function () {
    var out = {};
    out.typeofAll = typeof d.all;
    out.allIsUndefined = typeof d.all === 'undefined';
    try {
      out.truthy = !!d.all;
      out.length = d.all ? d.all.length : null;
      out.itemFn = d.all && typeof d.all.item === 'function';
    } catch (e) { out.error = e.name; }
    return out;
  });

  // ---------- 扩展/篡改脚本检测 ----------
  safe('extensionScan', function () {
    var gmKeys = Object.getOwnPropertyNames(w).filter(function (k) {
      return /^GM_|^grant|unsafeWindow|webpackChunk|__userscript/.test(k);
    }).slice(0, 15);
    var tamperKeys = Object.getOwnPropertyNames(w).filter(function (k) {
      return /tamper|userscript|monkey/i.test(k);
    }).slice(0, 15);
    return {
      gmKeys: gmKeys,
      tamperKeys: tamperKeys,
      hasUnsafeWindow: 'unsafeWindow' in w,
      inlineScanner: (function () {
        // 静态扫描自身脚本元素上的标志属性（飞林检测 inline 脚本源码特征）
        var markers = 0;
        Array.prototype.forEach.call(d.scripts, function (s) {
          if (!s.src && (s.getAttribute('data-userscript') || s.getAttribute('type') === 'text/userscript')) {
            markers += 1;
          }
        });
        return markers;
      })()
    };
  });

  // ---------- 回调完整性 ----------
  safe('callbackIntegrity', function () {
    var out = {};
    out.setTimeoutNative = nativeOf(w.setTimeout);
    out.setIntervalNative = nativeOf(w.setInterval);
    try {
      out.setTimeoutDescriptor = Object.getOwnPropertyDescriptor(w, 'setTimeout') ? 'own' : 'inherited';
    } catch (e) { out.setTimeoutDescriptor = null; }
    try {
      var desc = Object.getOwnPropertyDescriptor(Window.prototype, 'setTimeout');
      out.setTimeoutWritable = desc ? desc.writable : null;
      out.setTimeoutConfigurable = desc ? desc.configurable : null;
    } catch (e) { out.setTimeoutDescriptorInfo = null; }
    return out;
  });

  // ---------- 插件一致性 ----------
  safe('pluginConsistency', function () {
    var out = {};
    try {
      out.pluginsCount = n.plugins ? n.plugins.length : null;
      out.mimeTypesCount = n.mimeTypes ? n.mimeTypes.length : null;
      out.ratio = (out.pluginsCount !== null && out.mimeTypesCount)
        ? Math.round((out.pluginsCount / out.mimeTypesCount) * 100) / 100
        : null;
    } catch (e) { out.error = e.name; }
    return out;
  });

  // ---------- 飞林 SDK 全局形状 ----------
  safe('feilinGlobals', function () {
    var keys = Object.getOwnPropertyNames(w).filter(function (k) {
      return /feilin|fwsdk|deviceid|fingerprint/i.test(k);
    }).slice(0, 15);
    var out = { count: keys.length, keys: [] };
    keys.forEach(function (k) {
      try {
        out.keys.push({ name: k, typeof: typeof w[k] });
      } catch (e) { out.keys.push({ name: k, error: e.name }); }
    });
    return out;
  });

  // ---------- 组装上报 ----------
  var STABLE_KEYS = ['toStringDeep', 'documentAll', 'extensionScan', 'callbackIntegrity',
    'pluginConsistency', 'feilinGlobals'];
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
