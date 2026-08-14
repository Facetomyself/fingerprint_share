/* behavior-core 行为信号纯函数核心（无 DOM 依赖，UMD）
 * 参考 bot-signal (MIT) 的启发式模型：12 条信号 + 独立概率联合评分。
 * 事件结构：{ t, ty, x, y, dx, dy, px, sx, deltaY, keyLen, repeat, clickDetail, isTrusted, touchCount }
 *   t    = 相对会话起点毫秒
 *   ty   = m | k | w | c | t (mouse move / key / wheel / click / touch)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.behaviorCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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

  var WINDOW_MS = 60000;

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

  function createBuffer() {
    return { events: [] };
  }

  function pushEvent(buffer, ev) {
    buffer.events.push(ev);
    // 60s 滑动窗口剪枝
    var cutoff = ev.t - WINDOW_MS;
    while (buffer.events.length && buffer.events[0].t < cutoff) {
      buffer.events.shift();
    }
  }

  // ---------- 12 启发式 ----------

  function signalSynthetic(events) {
    var count = 0;
    events.forEach(function (e) {
      if (e.isTrusted === false) { count += 1; }
    });
    return { triggered: count > 0, detail: 'untrusted=' + count };
  }

  function signalTeleportMouse(events) {
    var moves = events.filter(function (e) { return e.ty === 'm'; });
    for (var i = 1; i < moves.length; i++) {
      var dt = moves[i].t - moves[i - 1].t;
      var dist = Math.sqrt(
        Math.pow(moves[i].x - moves[i - 1].x, 2) + Math.pow(moves[i].y - moves[i - 1].y, 2)
      );
      if ((dt <= 100 && dist > 600) || (dt <= 20 && dist > 200)) {
        return { triggered: true, detail: 'dt=' + dt.toFixed(0) + 'ms dist=' + dist.toFixed(0) + 'px' };
      }
    }
    return { triggered: false, detail: null };
  }

  function signalClickWithoutMovement(events) {
    var clicks = events.filter(function (e) { return e.ty === 'c' && e.clickDetail !== 0; });
    var moves = events.filter(function (e) { return e.ty === 'm'; });
    for (var i = 0; i < clicks.length; i++) {
      var hasPrior = moves.some(function (m) {
        return m.t < clicks[i].t && clicks[i].t - m.t <= 2000;
      });
      if (!hasPrior) {
        return { triggered: true, detail: 'click@' + clicks[i].t + 'ms no-prior-move' };
      }
    }
    return { triggered: false, detail: null };
  }

  function signalLinearTyping(events) {
    var keys = events.filter(function (e) { return e.ty === 'k' && !e.repeat; });
    var intervals = [];
    for (var i = 1; i < keys.length; i++) {
      intervals.push(keys[i].t - keys[i - 1].t);
    }
    if (intervals.length < 4) { return { triggered: false, detail: 'n=' + intervals.length }; }
    var c = cv(intervals);
    var mean = 0;
    intervals.forEach(function (v) { mean += v; });
    mean /= intervals.length;
    var triggered = (c !== null && c < 0.08) || mean < 25;
    return { triggered: triggered, detail: 'cv=' + (c === null ? '-' : c.toFixed(3)) + ' mean=' + mean.toFixed(1) + 'ms n=' + intervals.length };
  }

  function signalZeroDeltas(events) {
    var moves = events.filter(function (e) { return e.ty === 'm'; });
    if (moves.length < 51) { return { triggered: false, detail: 'n=' + moves.length }; }
    var allZero = moves.every(function (m) { return m.dx === 0 && m.dy === 0; });
    return { triggered: allZero, detail: 'n=' + moves.length + ' all-zero=' + allZero };
  }

  function signalLinearTapRhythm(events) {
    var taps = events.filter(function (e) { return e.ty === 't' && e.phase === 'start'; });
    var intervals = [];
    for (var i = 1; i < taps.length; i++) {
      intervals.push(taps[i].t - taps[i - 1].t);
    }
    if (intervals.length < 4) { return { triggered: false, detail: 'n=' + intervals.length }; }
    var c = cv(intervals);
    var mean = 0;
    intervals.forEach(function (v) { mean += v; });
    mean /= intervals.length;
    return { triggered: (c !== null && c < 0.08) || mean < 25, detail: 'cv=' + (c === null ? '-' : c.toFixed(3)) + ' mean=' + mean.toFixed(1) + 'ms' };
  }

  function signalLinearScroll(events) {
    var wheels = events.filter(function (e) { return e.ty === 'w'; });
    if (wheels.length < 4) { return { triggered: false, detail: 'n=' + wheels.length }; }
    var deltas = wheels.map(function (e) { return e.deltaY; });
    var intervals = [];
    for (var i = 1; i < wheels.length; i++) {
      intervals.push(wheels[i].t - wheels[i - 1].t);
    }
    var deltaCv = cv(deltas);
    var intervalCv = cv(intervals);
    var triggered = (deltaCv !== null && deltaCv < 0.1) && (intervalCv !== null && intervalCv < 0.12);
    return { triggered: triggered, detail: 'deltaCv=' + (deltaCv === null ? '-' : deltaCv.toFixed(3)) + ' intCv=' + (intervalCv === null ? '-' : intervalCv.toFixed(3)) };
  }

  function signalLinearMouseMovement(events) {
    var moves = events.filter(function (e) { return e.ty === 'm'; });
    if (moves.length < 14) { return { triggered: false, detail: 'n=' + moves.length }; }
    var WINDOW = 14;
    for (var start = 0; start + WINDOW <= moves.length; start++) {
      var speeds = [];
      var ys = [];
      for (var i = start; i < start + WINDOW - 1; i++) {
        var dt = moves[i + 1].t - moves[i].t;
        if (dt <= 0) { speeds.push(0); } else {
          var dist = Math.sqrt(
            Math.pow(moves[i + 1].x - moves[i].x, 2) + Math.pow(moves[i + 1].y - moves[i].y, 2)
          );
          speeds.push(dist / dt);
        }
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

  function signalLinearTouchMovement(events) {
    var moves = events.filter(function (e) { return e.ty === 't' && e.phase === 'move' && e.touchCount === 1; });
    if (moves.length < 14) { return { triggered: false, detail: 'n=' + moves.length }; }
    var WINDOW = 14;
    for (var start = 0; start + WINDOW <= moves.length; start++) {
      var speeds = [];
      for (var i = start; i < start + WINDOW - 1; i++) {
        var dt = moves[i + 1].t - moves[i].t;
        var dist = Math.sqrt(
          Math.pow(moves[i + 1].x - moves[i].x, 2) + Math.pow(moves[i + 1].y - moves[i].y, 2)
        );
        speeds.push(dt <= 0 ? 0 : dist / dt);
      }
      var speedCv = cv(speeds);
      if (speedCv !== null && speedCv < 0.08) {
        return { triggered: true, detail: 'window@' + start + ' speedCv=' + speedCv.toFixed(3) };
      }
    }
    return { triggered: false, detail: null };
  }

  function signalNoMouseActivity(events) {
    var moves = events.filter(function (e) { return e.ty === 'm'; }).length;
    var keys = events.filter(function (e) { return e.ty === 'k'; }).length;
    var clicks = events.filter(function (e) { return e.ty === 'c'; }).length;
    var triggered = moves === 0 && (keys > 0 || clicks > 0);
    return { triggered: triggered, detail: 'moves=' + moves + ' keys=' + keys + ' clicks=' + clicks };
  }

  function signalCdpCoordinateLeak(events) {
    var pointers = events.filter(function (e) {
      return (e.ty === 'm' || e.ty === 'c') && e.isTrusted !== false &&
        typeof e.px === 'number' && typeof e.sx === 'number';
    });
    var positions = {};
    pointers.forEach(function (e) {
      var key = e.px + ',' + e.sx;
      positions[key] = (positions[key] || 0) + 1;
    });
    var leaks = 0;
    var seenPositions = 0;
    Object.keys(positions).forEach(function (k) {
      if (positions[k] >= 2) {
        var parts = k.split(',');
        if (parts[0] === parts[1]) { leaks += 1; }
        seenPositions += 1;
      }
    });
    return { triggered: leaks >= 2, detail: 'leakPositions=' + leaks };
  }

  function signalRapidClickInterval(events) {
    var clicks = events.filter(function (e) { return e.ty === 'c' && e.clickDetail !== 0; });
    var run = 1;
    for (var i = 1; i < clicks.length; i++) {
      var dt = clicks[i].t - clicks[i - 1].t;
      if (dt <= 120) {
        run += 1;
        if (run >= 4) {
          return { triggered: true, detail: 'run=' + run + ' lastDt=' + dt + 'ms' };
        }
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

  function analyze(events) {
    var results = SIGNALS.map(function (meta) {
      var result = SIGNAL_FUNCTIONS[meta.id](events);
      return {
        id: meta.id,
        weight: meta.weight,
        confidence: meta.confidence,
        triggered: result.triggered,
        detail: result.detail
      };
    });
    // 独立概率联合：score = 1 - Π(1 - w)
    var product = 1;
    results.forEach(function (r) {
      if (r.triggered) { product *= (1 - r.weight); }
    });
    var score = Math.round((1 - product) * 1000) / 1000;
    var verdict = score < 0.55 ? 'legit' : 'suspicious';
    var highCount = results.filter(function (r) { return r.triggered && r.confidence === 'high'; }).length;
    var sampleCount = events.length;
    var confidence;
    if (sampleCount < 5) { confidence = 'low'; }
    else if (highCount >= 2 || score >= 0.75) { confidence = 'high'; }
    else if (score >= 0.4 || sampleCount >= 20) { confidence = 'medium'; }
    else { confidence = 'low'; }
    return { signals: results, score: score, verdict: verdict, confidence: confidence };
  }

  // ---------- 统计特征 ----------

  function computeStats(events) {
    var moves = events.filter(function (e) { return e.ty === 'm'; });
    var speeds = [];
    var intervals = [];
    for (var i = 1; i < moves.length; i++) {
      var dt = moves[i].t - moves[i - 1].t;
      var dist = Math.sqrt(
        Math.pow(moves[i].x - moves[i - 1].x, 2) + Math.pow(moves[i].y - moves[i - 1].y, 2)
      );
      if (dt > 0) { speeds.push(dist / dt); }
      intervals.push(dt);
    }
    var sortedSpeeds = speeds.slice().sort(function (a, b) { return a - b; });
    var histBuckets = [16, 32, 64, 128, 256, 512, 1024];
    var hist = histBuckets.map(function (upper) {
      return ['0-' + upper, intervals.filter(function (v) { return v < upper; }).length];
    });
    var over = intervals.filter(function (v) { return v >= 1024; }).length;
    hist.push(['1024+', over]);
    var turns = 0;
    for (var j = 2; j < moves.length; j++) {
      var v1x = moves[j - 1].x - moves[j - 2].x;
      var v1y = moves[j - 1].y - moves[j - 2].y;
      var v2x = moves[j].x - moves[j - 1].x;
      var v2y = moves[j].y - moves[j - 1].y;
      var cross = v1x * v2y - v1y * v2x;
      if (cross < 0) { turns += 1; }
    }
    var wheels = events.filter(function (e) { return e.ty === 'w'; });
    var scrollDeltas = wheels.map(function (e) { return Math.abs(e.deltaY); }).sort(function (a, b) { return a - b; });
    var keys = events.filter(function (e) { return e.ty === 'k' && !e.repeat; });
    var keyIntervals = [];
    for (var k = 1; k < keys.length; k++) {
      keyIntervals.push(keys[k].t - keys[k - 1].t);
    }
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
      scrollDelta: {
        p50: percentile(scrollDeltas, 0.5),
        p90: percentile(scrollDeltas, 0.9),
        samples: scrollDeltas.length
      },
      keyIntervalMs: {
        mean: Math.round(keyMean * 10) / 10,
        cv: keyCv === null ? null : Math.round(keyCv * 1000) / 1000,
        samples: keyIntervals.length
      }
    };
  }

  // ---------- 降采样（600 点上限，均匀 stride 保首尾） ----------

  function downsample(events, maxPoints) {
    var limit = maxPoints || 600;
    if (events.length <= limit) { return events; }
    var stride = Math.ceil(events.length / limit);
    var sampled = [];
    for (var i = 0; i < events.length; i += stride) {
      sampled.push(events[i]);
    }
    var last = events[events.length - 1];
    if (sampled[sampled.length - 1] !== last) {
      sampled.push(last);
      if (sampled.length > limit) {
        sampled.splice(sampled.length - 2, 1);
      }
    }
    return sampled;
  }

  function eventCounts(events) {
    var counts = { mousemove: 0, keydown: 0, wheel: 0, click: 0, touch: 0 };
    events.forEach(function (e) {
      if (e.ty === 'm') { counts.mousemove += 1; }
      else if (e.ty === 'k') { counts.keydown += 1; }
      else if (e.ty === 'w') { counts.wheel += 1; }
      else if (e.ty === 'c') { counts.click += 1; }
      else if (e.ty === 't') { counts.touch += 1; }
    });
    return counts;
  }

  function buildTrajectory(events, maxPoints) {
    var sampled = downsample(events, maxPoints);
    var points = sampled.map(function (e) {
      return { t: Math.round(e.t), x: Math.round(e.x), y: Math.round(e.y), ty: e.ty };
    });
    var firstT = events.length ? events[0].t : 0;
    var lastT = events.length ? events[events.length - 1].t : 0;
    return {
      totalEvents: events.length,
      sampled: points.length,
      durationMs: Math.round(lastT - firstT),
      points: points
    };
  }

  return {
    SIGNALS: SIGNALS,
    WINDOW_MS: WINDOW_MS,
    createBuffer: createBuffer,
    pushEvent: pushEvent,
    analyze: analyze,
    computeStats: computeStats,
    downsample: downsample,
    eventCounts: eventCounts,
    buildTrajectory: buildTrajectory
  };
});
