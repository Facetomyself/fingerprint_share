/* ruishu-rs6-challenge-electricity 采集模板
 * 专有探测面（通用面由 generic-deep-v3 覆盖，本条目聚焦瑞数 6 挑战页环境面）：
 *   - $_ts 类全局变量形状（瑞数 VM 初始化标志，键名与类型不读值）
 *   - script 元素结构（内联/外链分组、动态插入观察）
 *   - meta 标签集合与 URL 参数名结构（不含值）
 *   - cookie 键名集合（不含值）
 *   - DOM gate 探测（createElement 原型链深度，瑞数环境 gate 依赖）
 * 来源：workspace/electricity-ruishu-web-v2（RS6 412 挑战页 + $_ts 初始化研究）。
 * 契约：调用 window.__fp_submit(payload)；不含 "</" + "script" 字面量。
 */
(async function () {
  'use strict';

  var SCRIPT = 'ruishu-rs6-challenge-electricity';
  var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var w = window;
  var d = document;
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

  // ---------- $_ts 类全局变量形状 ----------
  safe('rsGlobals', function () {
    var keys = Object.getOwnPropertyNames(w).filter(function (k) {
      return k.indexOf('_$') === 0 || k.indexOf('$ts') === 0 ||
        /^(jsc|rs|metas|meta|document)_.{2,}$/i.test(k);
    }).slice(0, 25);
    var out = { count: keys.length, keys: [] };
    keys.forEach(function (k) {
      try {
        var desc = Object.getOwnPropertyDescriptor(w, k);
        out.keys.push({
          name: k,
          typeof: typeof w[k],
          hasGet: desc ? typeof desc.get === 'function' : false
        });
      } catch (e) { out.keys.push({ name: k, error: e.name }); }
    });
    out.tsDefined = typeof w.$_ts !== 'undefined';
    return out;
  });

  // ---------- script 元素结构 ----------
  safe('scriptStructure', function () {
    var inline = 0;
    var external = [];
    var dynMarkers = 0;
    Array.prototype.forEach.call(d.scripts, function (s) {
      if (s.src) {
        external.push(s.src.slice(0, 200));
      } else {
        inline += 1;
      }
      if (s.getAttribute('data-ts') || s.getAttribute('id') || s.getAttribute('r')) {
        dynMarkers += 1;
      }
    });
    var externalDomains = {};
    external.forEach(function (src) {
      try {
        var host = new URL(src, location.href).hostname;
        externalDomains[host] = (externalDomains[host] || 0) + 1;
      } catch (e) { externalDomains['unparsed'] = (externalDomains['unparsed'] || 0) + 1; }
    });
    return {
      inlineCount: inline,
      externalCount: external.length,
      dynamicMarkerCount: dynMarkers,
      externalDomains: externalDomains
    };
  });

  // ---------- meta 与 URL 参数名结构 ----------
  safe('metaAndUrl', function () {
    var metas = [];
    Array.prototype.forEach.call(d.getElementsByTagName('meta'), function (m) {
      metas.push({
        name: (m.getAttribute('name') || m.getAttribute('http-equiv') || '').slice(0, 60),
        contentLen: (m.getAttribute('content') || '').length
      });
    });
    var paramNames = [];
    var search = location.search.slice(1);
    if (search) {
      paramNames = search.split('&').map(function (pair) {
        return pair.split('=')[0].slice(0, 80);
      });
    }
    return {
      metas: metas.slice(0, 15),
      queryParamNames: paramNames.slice(0, 20),
      queryLength: location.search.length
    };
  });

  // ---------- cookie 键名集合（不含值） ----------
  safe('cookieKeyShape', function () {
    var keys = d.cookie.split(';').map(function (part) {
      return part.trim().split('=')[0].slice(0, 100);
    }).filter(function (k) { return k.length > 0; });
    return {
      count: keys.length,
      keys: keys.slice(0, 30),
      avgKeyLength: keys.length ? Math.round(keys.join('').length / keys.length) : 0
    };
  });

  // ---------- DOM gate：createElement 原型链深度 ----------
  safe('domGate', function () {
    var el = d.createElement('div');
    var chain = [];
    var cursor = el;
    var depth = 0;
    while (cursor && depth < 10) {
      var ctor = cursor.constructor;
      chain.push(ctor ? ctor.name : (Object.prototype.toString.call(cursor))) ;
      cursor = Object.getPrototypeOf(cursor);
      depth += 1;
    }
    var cloneSupport = false;
    try {
      var clone = el.cloneNode(true);
      cloneSupport = clone instanceof d.defaultView.Element;
    } catch (e) { cloneSupport = false; }
    return {
      prototypeChain: chain,
      chainDepth: depth,
      cloneNodeInstanceof: cloneSupport,
      elementNativeToString: (function () {
        try {
          return /\[native code\]/.test(Function.prototype.toString.call(d.createElement));
        } catch (e) { return null; }
      })()
    };
  });

  // ---------- 组装上报 ----------
  var STABLE_KEYS = ['rsGlobals', 'scriptStructure', 'metaAndUrl', 'cookieKeyShape', 'domGate'];
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
