/* behavior-inject 嵌入式行为采集器（自包含单文件）
 * 用途：注入目标网页的真实 UI 上采集行为指纹——行为特征与页面结构绑定，
 *       这是行为指纹的正确采集语境（平台行为页只是采集器演示，见 behavior.html）。
 * 用法：在目标网页浏览器控制台执行：
 *   fetch('http://127.0.0.1:8000/static/js/behavior-inject.js').then(r => r.text()).then(eval)
 * 然后按悬浮条操作（自动 30s 或手动提交）。上报 kind=behavior + pageContext（页面语境）。
 * 信号模型与平台 behavior-core 一致（12 启发式 + 1-PI(1-w) 评分 + 600 点降采样）。
 * 注意：不含 "</" + "script" 字面量；不读取或上报页面文本内容。
 */
(function () {
  'use strict';

  if (window.__fpInjectLoaded) { return; }
  window.__fpInjectLoaded = true;

  var CONFIG = {
    platform: 'http://127.0.0.1:8000',
    entrySlug: window.__FP_ENTRY_SLUG || null,
    autoMs: 30000,
    hardTimeoutMs: 45000,
    minObserveMs: 3000,
    maxPoints: 600
  };

  var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var events = [];
  var firstEventT = null;
  var submitted = false;
  var suspended = false;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  // ---------- 核心：12 启发式（与 behavior-core 判定一致） ----------

  function cv(values) {
    if (!values.length) { return null; }
    var mean = 0;
    for (var i = 0; i < values.length; i++) { mean += values[i]; }
    mean /= values.length;
    if (mean === 0) { return 0; }
    var variance = 0;
    for (var j = 0; j < values.length; j++) {
      variance += (values[j] - mean) * (values[j] - mean);
    }
    return Math.sqrt(variance / values.length) / mean;
  }

  function percentile(sorted, p) {
    if (!sorted.length) { return 0; }
    var idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[idx];
  }

  var SIGNALS = [
    { id: 'synthetic-events', weight: 0.50, confidence: 'high' },
    { id: 'teleport-mouse', weight: 0.40, confidence: 'high' },
    { id: 'click-without-mouse-movement', weight: 0.35, confidence: 'high' },
    { id: 'linear-typing', weight: 0.35, confidence: 'high' },
    { id: 'zero-mouse-movement-deltas', weight: 0.30, confidence: 'medium' },
    { id: 'linear-tap-rhythm', weight: 0.30, confidence: 'medium' },
    { id: 'linear-scroll', weight: 0.30, confidence: 'medium' },
    { id: 'linear-mouse-movement', weight: 0.25, confidence: 'medium' },
    { id: 'linear-touch-movement', weight: 0.25, confidence: 'medium' },
    { id: 'no-mouse-activity', weight: 0.20, confidence: 'low' },
    { id: 'cdp-input-coordinate-leak', weight: 0.20, confidence: 'low' },
    { id: 'rapid-click-interval', weight: 0.20, confidence: 'high' }
  ];

  function signalSynthetic(evs) {
    var count = 0;
    evs.forEach(function (e) { if (e.isTrusted === false) { count += 1; } });
    return { triggered: count > 0, detail: 'untrusted=' + count };
  }
  function signalTeleportMouse(evs) {
    var moves = evs.filter(function (e) { return e.ty === 'm'; });
    for (var i = 1; i < moves.length; i++) {
      var dt = moves[i].t - moves[i - 1].t;
      var dist = Math.sqrt(Math.pow(moves[i].x - moves[i - 1].x, 2) + Math.pow(moves[i].y - moves[i - 1].y, 2));
      if ((dt <= 100 && dist > 600) || (dt <= 20 && dist > 200)) {
        return { triggered: true, detail: 'dt=' + dt.toFixed(0) + 'ms dist=' + dist.toFixed(0) + 'px' };
      }
    }
    return { triggered: false, detail: null };
  }
  function signalClickWithoutMovement(evs) {
    var clicks = evs.filter(function (e) { return e.ty === 'c' && e.clickDetail !== 0; });
    var moves = evs.filter(function (e) { return e.ty === 'm'; });
    for (var i = 0; i < clicks.length; i++) {
      var hasPrior = moves.some(function (m) { return m.t < clicks[i].t && clicks[i].t - m.t <= 2000; });
      if (!hasPrior) {
        return { triggered: true, detail: 'click@' + clicks[i].t + 'ms no-prior-move' };
      }
    }
    return { triggered: false, detail: null };
  }
  function signalLinearTyping(evs) {
    var keys = evs.filter(function (e) { return e.ty === 'k' && !e.repeat; });
    var intervals = [];
    for (var i = 1; i < keys.length; i++) { intervals.push(keys[i].t - keys[i - 1].t); }
    if (intervals.length < 4) { return { triggered: false, detail: 'n=' + intervals.length }; }
    var c = cv(intervals);
    var mean = 0;
    intervals.forEach(function (v) { mean += v; });
    mean /= intervals.length;
    return { triggered: (c !== null && c < 0.08) || mean < 25, detail: 'cv=' + (c === null ? '-' : c.toFixed(3)) + ' mean=' + mean.toFixed(1) + 'ms' };
  }
  function signalZeroDeltas(evs) {
    var moves = evs.filter(function (e) { return e.ty === 'm'; });
    if (moves.length < 51) { return { triggered: false, detail: 'n=' + moves.length }; }
    var allZero = moves.every(function (m) { return m.dx === 0 && m.dy === 0; });
    return { triggered: allZero, detail: 'n=' + moves.length };
  }
  function signalLinearTapRhythm(evs) {
    var taps = evs.filter(function (e) { return e.ty === 't' && e.phase === 'start'; });
    var intervals = [];
    for (var i = 1; i < taps.length; i++) { intervals.push(taps[i].t - taps[i - 1].t); }
    if (intervals.length < 4) { return { triggered: false, detail: 'n=' + intervals.length }; }
    var c = cv(intervals);
    var mean = 0;
    intervals.forEach(function (v) { mean += v; });
    mean /= intervals.length;
    return { triggered: (c !== null && c < 0.08) || mean < 25, detail: 'cv=' + (c === null ? '-' : c.toFixed(3)) + ' mean=' + mean.toFixed(1) + 'ms' };
  }
  function signalLinearScroll(evs) {
    var wheels = evs.filter(function (e) { return e.ty === 'w'; });
    if (wheels.length < 4) { return { triggered: false, detail: 'n=' + wheels.length }; }
    var deltas = wheels.map(function (e) { return e.deltaY; });
    var intervals = [];
    for (var i = 1; i < wheels.length; i++) { intervals.push(wheels[i].t - wheels[i - 1].t); }
    var deltaCv = cv(deltas);
    var intervalCv = cv(intervals);
    return { triggered: (deltaCv !== null && deltaCv < 0.1) && (intervalCv !== null && intervalCv < 0.12),
      detail: 'deltaCv=' + (deltaCv === null ? '-' : deltaCv.toFixed(3)) + ' intCv=' + (intervalCv === null ? '-' : intervalCv.toFixed(3)) };
  }
  function signalLinearMouseMovement(evs) {
    var moves = evs.filter(function (e) { return e.ty === 'm'; });
    if (moves.length < 14) { return { triggered: false, detail: 'n=' + moves.length }; }
    var WINDOW = 14;
    for (var start = 0; start + WINDOW <= moves.length; start++) {
      var speeds = [];
      var ys = [];
      for (var i = start; i < start + WINDOW - 1; i++) {
        var dt = moves[i + 1].t - moves[i].t;
        var dist = Math.sqrt(Math.pow(moves[i + 1].x - moves[i].x, 2) + Math.pow(moves[i + 1].y - moves[i].y, 2));
        speeds.push(dt <= 0 ? 0 : dist / dt);
        ys.push(moves[i].y);
      }
      var speedCv = cv(speeds);
      var yMin = Math.min.apply(null, ys);
      var yMax = Math.max.apply(null, ys);
      if (speedCv !== null && speedCv < 0.08 && (yMax - yMin) < 4) {
        return { triggered: true, detail: 'window@' + start + ' speedCv=' + speedCv.toFixed(3) + ' yRange=' + (yMax - yMin) };
      }
    }
    return { triggered: false, detail: null };
  }
  function signalLinearTouchMovement(evs) {
    var moves = evs.filter(function (e) { return e.ty === 't' && e.phase === 'move' && e.touchCount === 1; });
    if (moves.length < 14) { return { triggered: false, detail: 'n=' + moves.length }; }
    var WINDOW = 14;
    for (var start = 0; start + WINDOW <= moves.length; start++) {
      var speeds = [];
      for (var i = start; i < start + WINDOW - 1; i++) {
        var dt = moves[i + 1].t - moves[i].t;
        var dist = Math.sqrt(Math.pow(moves[i + 1].x - moves[i].x, 2) + Math.pow(moves[i + 1].y - moves[i].y, 2));
        speeds.push(dt <= 0 ? 0 : dist / dt);
      }
      var speedCv = cv(speeds);
      if (speedCv !== null && speedCv < 0.08) {
        return { triggered: true, detail: 'window@' + start + ' speedCv=' + speedCv.toFixed(3) };
      }
    }
    return { triggered: false, detail: null };
  }
  function signalNoMouseActivity(evs) {
    var moves = evs.filter(function (e) { return e.ty === 'm'; }).length;
    var keys = evs.filter(function (e) { return e.ty === 'k'; }).length;
    var clicks = evs.filter(function (e) { return e.ty === 'c'; }).length;
    return { triggered: moves === 0 && (keys > 0 || clicks > 0), detail: 'moves=' + moves + ' keys=' + keys + ' clicks=' + clicks };
  }
  function signalCdpCoordinateLeak(evs) {
    var pointers = evs.filter(function (e) {
      return (e.ty === 'm' || e.ty === 'c') && e.isTrusted !== false && typeof e.px === 'number' && typeof e.sx === 'number';
    });
    var positions = {};
    pointers.forEach(function (e) {
      var key = e.px + ',' + e.sx;
      positions[key] = (positions[key] || 0) + 1;
    });
    var leaks = 0;
    Object.keys(positions).forEach(function (k) {
      if (positions[k] >= 2) {
        var parts = k.split(',');
        if (parts[0] === parts[1]) { leaks += 1; }
      }
    });
    return { triggered: leaks >= 2, detail: 'leakPositions=' + leaks };
  }
  function signalRapidClickInterval(evs) {
    var clicks = evs.filter(function (e) { return e.ty === 'c' && e.clickDetail !== 0; });
    var run = 1;
    for (var i = 1; i < clicks.length; i++) {
      var dt = clicks[i].t - clicks[i - 1].t;
      if (dt <= 120) {
        run += 1;
        if (run >= 4) { return { triggered: true, detail: 'run=' + run + ' lastDt=' + dt + 'ms' }; }
      } else {
        run = 1;
      }
    }
    return { triggered: false, detail: null };
  }

  var SIGNAL_FUNCTIONS = {
    'synthetic-events': signalSynthetic,
    'teleport-mouse': signalTeleportMouse,
    'click-without-mouse-movement': signalClickWithoutMovement,
    'linear-typing': signalLinearTyping,
    'zero-mouse-movement-deltas': signalZeroDeltas,
    'linear-tap-rhythm': signalLinearTapRhythm,
    'linear-scroll': signalLinearScroll,
    'linear-mouse-movement': signalLinearMouseMovement,
    'linear-touch-movement': signalLinearTouchMovement,
    'no-mouse-activity': signalNoMouseActivity,
    'cdp-input-coordinate-leak': signalCdpCoordinateLeak,
    'rapid-click-interval': signalRapidClickInterval
  };

  function analyze(evs) {
    var results = SIGNALS.map(function (meta) {
      var result = SIGNAL_FUNCTIONS[meta.id](evs);
      return { id: meta.id, weight: meta.weight, confidence: meta.confidence, triggered: result.triggered, detail: result.detail };
    });
    var product = 1;
    results.forEach(function (r) { if (r.triggered) { product *= (1 - r.weight); } });
    var score = Math.round((1 - product) * 1000) / 1000;
    var verdict = score < 0.55 ? 'legit' : 'suspicious';
    var highCount = results.filter(function (r) { return r.triggered && r.confidence === 'high'; }).length;
    var sampleCount = evs.length;
    var confidence;
    if (sampleCount < 5) { confidence = 'low'; }
    else if (highCount >= 2 || score >= 0.75) { confidence = 'high'; }
    else if (score >= 0.4 || sampleCount >= 20) { confidence = 'medium'; }
    else { confidence = 'low'; }
    return { signals: results, score: score, verdict: verdict, confidence: confidence };
  }

  function computeStats(evs) {
    var moves = evs.filter(function (e) { return e.ty === 'm'; });
    var speeds = [];
    var intervals = [];
    for (var i = 1; i < moves.length; i++) {
      var dt = moves[i].t - moves[i - 1].t;
      var dist = Math.sqrt(Math.pow(moves[i].x - moves[i - 1].x, 2) + Math.pow(moves[i].y - moves[i - 1].y, 2));
      if (dt > 0) { speeds.push(dist / dt); }
      intervals.push(dt);
    }
    var sortedSpeeds = speeds.slice().sort(function (a, b) { return a - b; });
    var histBuckets = [16, 32, 64, 128, 256, 512, 1024];
    var hist = histBuckets.map(function (upper) {
      return ['0-' + upper, intervals.filter(function (v) { return v < upper; }).length];
    });
    hist.push(['1024+', intervals.filter(function (v) { return v >= 1024; }).length]);
    var turns = 0;
    for (var j = 2; j < moves.length; j++) {
      var v1x = moves[j - 1].x - moves[j - 2].x;
      var v1y = moves[j - 1].y - moves[j - 2].y;
      var v2x = moves[j].x - moves[j - 1].x;
      var v2y = moves[j].y - moves[j - 1].y;
      if (v1x * v2y - v1y * v2x < 0) { turns += 1; }
    }
    var wheels = evs.filter(function (e) { return e.ty === 'w'; });
    var scrollDeltas = wheels.map(function (e) { return Math.abs(e.deltaY); }).sort(function (a, b) { return a - b; });
    var keys = evs.filter(function (e) { return e.ty === 'k' && !e.repeat; });
    var keyIntervals = [];
    for (var k = 1; k < keys.length; k++) { keyIntervals.push(keys[k].t - keys[k - 1].t); }
    var keyMean = 0;
    keyIntervals.forEach(function (v) { keyMean += v; });
    if (keyIntervals.length) { keyMean /= keyIntervals.length; }
    var keyCv = cv(keyIntervals);
    return {
      speedPercentiles: {
        p50: Math.round(percentile(sortedSpeeds, 0.5) * 100) / 100,
        p90: Math.round(percentile(sortedSpeeds, 0.9) * 100) / 100,
        max: Math.round(percentile(sortedSpeeds, 1) * 100) / 100
      },
      intervalHistogram: hist,
      directionTurns: turns,
      scrollDelta: { p50: percentile(scrollDeltas, 0.5), p90: percentile(scrollDeltas, 0.9), samples: scrollDeltas.length },
      keyIntervalMs: { mean: Math.round(keyMean * 10) / 10, cv: keyCv === null ? null : Math.round(keyCv * 1000) / 1000, samples: keyIntervals.length }
    };
  }

  function downsample(evs, maxPoints) {
    var limit = maxPoints || 600;
    if (evs.length <= limit) { return evs; }
    var stride = Math.ceil(evs.length / limit);
    var sampled = [];
    for (var i = 0; i < evs.length; i += stride) { sampled.push(evs[i]); }
    var last = evs[evs.length - 1];
    if (sampled[sampled.length - 1] !== last) {
      sampled.push(last);
      if (sampled.length > limit) { sampled.splice(sampled.length - 2, 1); }
    }
    return sampled;
  }

  function eventCounts(evs) {
    var counts = { mousemove: 0, keydown: 0, wheel: 0, click: 0, touch: 0 };
    evs.forEach(function (e) {
      if (e.ty === 'm') { counts.mousemove += 1; }
      else if (e.ty === 'k') { counts.keydown += 1; }
      else if (e.ty === 'w') { counts.wheel += 1; }
      else if (e.ty === 'c') { counts.click += 1; }
      else if (e.ty === 't') { counts.touch += 1; }
    });
    return counts;
  }

  // ---------- 事件监听（真实页面 UI） ----------

  function emit(ty, extra) {
    if (submitted || suspended) { return; }
    var t = now() - t0;
    var ev = { t: t, ty: ty };
    if (extra) {
      Object.keys(extra).forEach(function (k) { ev[k] = extra[k]; });
    }
    if (firstEventT === null) {
      firstEventT = now();
      setTimeout(function () {
        if (!submitted && elapsed() >= CONFIG.autoMs) { submit(); }
      }, CONFIG.autoMs);
    }
    events.push(ev);
    var cutoff = ev.t - 60000;
    while (events.length && events[0].t < cutoff) { events.shift(); }
    updateUi();
  }

  function elapsed() {
    return firstEventT === null ? 0 : now() - firstEventT;
  }

  // 元素上下文形状（与 UI 绑定证据，不含文本内容）
  function elementShape(target) {
    if (!target || !target.tagName) { return null; }
    var shape = { tag: target.tagName.toLowerCase() };
    try {
      if (target.className && typeof target.className === 'string') {
        shape.cls = target.className.split(/\s+/).slice(0, 2).join(' ');
      }
      if (target.getAttribute && target.getAttribute('role')) {
        shape.role = target.getAttribute('role').slice(0, 40);
      }
      if (target.tagName === 'INPUT') {
        shape.inputType = target.type ? target.type.slice(0, 20) : null;
      }
      if (target.id && target.id.length < 60) { shape.id = target.id; }
    } catch (e) { /* 忽略 */ }
    return shape;
  }

  document.addEventListener('mousemove', function (e) {
    emit('m', {
      x: e.clientX, y: e.clientY,
      dx: e.movementX || 0, dy: e.movementY || 0,
      px: e.pageX, sx: e.screenX,
      isTrusted: e.isTrusted
    });
  }, { passive: true });

  document.addEventListener('wheel', function (e) {
    emit('w', { deltaY: e.deltaY, isTrusted: e.isTrusted });
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    emit('k', {
      keyLen: e.key ? e.key.length : 0,
      repeat: !!e.repeat,
      isTrusted: e.isTrusted,
      el: elementShape(e.target)
    });
  });

  document.addEventListener('click', function (e) {
    emit('c', {
      x: e.clientX, y: e.clientY,
      px: e.pageX, sx: e.screenX,
      clickDetail: e.detail || 0,
      isTrusted: e.isTrusted,
      el: elementShape(e.target)
    });
  });

  document.addEventListener('touchstart', function (e) {
    emit('t', {
      x: e.touches[0] ? e.touches[0].clientX : 0,
      y: e.touches[0] ? e.touches[0].clientY : 0,
      phase: 'start', touchCount: e.touches.length,
      isTrusted: e.isTrusted
    });
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    emit('t', {
      x: e.touches[0] ? e.touches[0].clientX : 0,
      y: e.touches[0] ? e.touches[0].clientY : 0,
      phase: 'move', touchCount: e.touches.length,
      isTrusted: e.isTrusted
    });
  }, { passive: true });

  // ---------- 悬浮控制条 UI（最小侵入） ----------

  var bar = document.createElement('div');
  bar.id = '__fp_inject_bar';
  bar.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;' +
    'background:rgba(20,20,30,0.86);backdrop-filter:blur(14px);color:#f5f5f7;' +
    'font:12px -apple-system,"Segoe UI",sans-serif;border-radius:12px;' +
    'border:1px solid rgba(255,255,255,0.12);padding:10px 12px;' +
    'display:flex;gap:8px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,0.4);';

  var btnStyle = 'background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.16);' +
    'color:#fff;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;';

  function makeButton(text, onClick, disabled) {
    var b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = btnStyle;
    b.disabled = !!disabled;
    b.onclick = onClick;
    return b;
  }

  var label = document.createElement('span');
  label.textContent = '行为采集: 0 事件';
  label.style.color = '#b6b6c2';

  var submitBtn = makeButton('提交', function () { submit(); }, true);
  var pauseBtn = makeButton('暂停', function () {
    suspended = !suspended;
    pauseBtn.textContent = suspended ? '继续' : '暂停';
    label.textContent = suspended ? '已暂停' : ('行为采集: ' + events.length + ' 事件');
  });
  var closeBtn = makeButton('结束', function () {
    if (!submitted && events.length > 0 && elapsed() >= CONFIG.minObserveMs) {
      submit();
    }
    cleanup();
  });

  bar.appendChild(label);
  bar.appendChild(submitBtn);
  bar.appendChild(pauseBtn);
  bar.appendChild(closeBtn);
  document.body.appendChild(bar);

  function updateUi() {
    var remain = firstEventT === null ? '' : ' · 剩 ' + Math.max(0, Math.round((CONFIG.autoMs - elapsed()) / 1000)) + 's';
    label.textContent = '行为采集: ' + events.length + ' 事件' + remain;
    submitBtn.disabled = firstEventT === null || elapsed() < CONFIG.minObserveMs;
  }

  function cleanup() {
    if (bar.parentNode) { bar.parentNode.removeChild(bar); }
  }

  // ---------- 提交 ----------

  function buildPayload() {
    var analysis = analyze(events);
    var stats = computeStats(events);
    var sampled = downsample(events, CONFIG.maxPoints);
    var points = sampled.map(function (e) {
      var p = { t: Math.round(e.t), x: Math.round(e.x), y: Math.round(e.y), ty: e.ty };
      if (e.el) { p.el = e.el; }
      return p;
    });
    var effectiveSlug = CONFIG.entrySlug || 'generic-deep-v3';
    return {
      script: 'behavior-inject-v1',
      kind: 'behavior',
      collectedAt: new Date().toISOString(),
      pageContext: {
        url: location.href.slice(0, 800),
        title: (document.title || '').slice(0, 200),
        entrySlug: effectiveSlug
      },
      behavior: {
        session: { durationMs: Math.round(elapsed()), eventCounts: eventCounts(events) },
        signals: analysis.signals,
        score: analysis.score,
        verdict: analysis.verdict,
        confidence: analysis.confidence,
        stats: stats,
        trajectory: {
          totalEvents: events.length,
          sampled: points.length,
          durationMs: Math.round(events.length ? events[events.length - 1].t - events[0].t : 0),
          points: points
        }
      },
      errors: [],
      durationMs: Math.round(now() - t0)
    };
  }

  function submit() {
    if (submitted) { return; }
    if (firstEventT === null || elapsed() < CONFIG.minObserveMs) { return; }
    submitted = true;
    label.textContent = '上报中...';
    var payload = buildPayload();
    var slug = payload.pageContext.entrySlug;
    fetch(CONFIG.platform + '/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: slug,
        kind: 'behavior',
        payload: payload,
        summary: { script: 'behavior-inject-v1', score: payload.behavior.score, verdict: payload.behavior.verdict, dimensions: payload.behavior.session.eventCounts },
        duration_ms: payload.durationMs
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        label.textContent = '已上报: score=' + payload.behavior.score + ' ' + payload.behavior.verdict;
      } else {
        label.textContent = '上报失败: ' + ((r.data && r.data.detail) || 'error');
        submitted = false;
      }
    }).catch(function (e) {
      label.textContent = '上报失败: ' + e.message;
      submitted = false;
    });
  }

  setTimeout(function () {
    if (!submitted && events.length > 0) { submit(); }
  }, CONFIG.hardTimeoutMs);

  console.log('[fp-inject] 行为采集器已注入。真实操作页面（移动/点击/输入/滚动），30s 自动提交或点悬浮条「提交」。');
})();
