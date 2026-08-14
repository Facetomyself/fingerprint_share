/* 行为剧本页采集桥：事件流 + 上报（kind=behavior，含 pageContext） */
(function () {
  'use strict';
  var PLATFORM = 'http://106.15.239.221:8000';
  var SLUG = 'ruishu-rs6-electricity';
  var core = window.behaviorCore;
  if (!core) { return; }
  var buffer = core.createBuffer();
  var t0 = performance.now();
  var firstEventT = null;
  var submitted = false;
  var stageMarks = [];
  var AUTO_MS = 30000;
  var MIN_OBSERVE_MS = 3000;

  function elapsed() { return firstEventT === null ? 0 : performance.now() - firstEventT; }

  function emit(ty, extra) {
    if (submitted) { return; }
    var ev = { t: performance.now() - t0, ty: ty };
    if (extra) { Object.keys(extra).forEach(function (k) { ev[k] = extra[k]; }); }
    if (firstEventT === null) {
      firstEventT = performance.now();
      setTimeout(function () { if (!submitted && elapsed() >= AUTO_MS) { submit(); } }, AUTO_MS);
    }
    core.pushEvent(buffer, ev);
    updateBar();
  }

  function elementShape(target) {
    if (!target || !target.tagName) { return null; }
    var shape = { tag: target.tagName.toLowerCase() };
    try {
      if (target.className && typeof target.className === 'string') {
        shape.cls = target.className.split(/\s+/).slice(0, 2).join(' ');
      }
      if (target.id && target.id.length < 60) { shape.id = target.id; }
    } catch (e) { /* 忽略 */ }
    return shape;
  }

  document.addEventListener('mousemove', function (e) {
    emit('m', { x: e.clientX, y: e.clientY, dx: e.movementX || 0, dy: e.movementY || 0,
      px: e.pageX, sx: e.screenX, isTrusted: e.isTrusted });
  }, { passive: true });
  document.addEventListener('wheel', function (e) {
    emit('w', { deltaY: e.deltaY, isTrusted: e.isTrusted });
  }, { passive: true });
  document.addEventListener('keydown', function (e) {
    emit('k', { keyLen: e.key ? e.key.length : 0, repeat: !!e.repeat,
      isTrusted: e.isTrusted, el: elementShape(e.target) });
  });
  document.addEventListener('click', function (e) {
    emit('c', { x: e.clientX, y: e.clientY, px: e.pageX, sx: e.screenX,
      clickDetail: e.detail || 0, isTrusted: e.isTrusted, el: elementShape(e.target) });
  });

  // 悬浮指示条
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;' +
    'background:rgba(20,20,30,0.86);color:#f5f5f7;font:12px sans-serif;border-radius:12px;' +
    'border:1px solid rgba(255,255,255,0.12);padding:10px 12px;display:flex;gap:8px;align-items:center;';
  var label = document.createElement('span');
  label.textContent = '行为采集: 0 事件';
  label.style.color = '#b6b6c2';
  var submitBtn = document.createElement('button');
  submitBtn.textContent = '提交';
  submitBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.16);' +
    'color:#fff;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;';
  submitBtn.disabled = true;
  submitBtn.onclick = function () { submit(); };
  bar.appendChild(label);
  bar.appendChild(submitBtn);
  function mountBar() {
    if (document.body) { document.body.appendChild(bar); } else { setTimeout(mountBar, 50); }
  }
  mountBar();

  function updateBar() {
    if (submitted) { return; }
    var remain = firstEventT === null ? '' : ' · 剩 ' + Math.max(0, Math.round((AUTO_MS - elapsed()) / 1000)) + 's';
    label.textContent = '行为采集: ' + buffer.events.length + ' 事件' + remain +
      (stageMarks.length ? ' · ' + stageMarks[stageMarks.length - 1].name : '');
    submitBtn.disabled = firstEventT === null || elapsed() < MIN_OBSERVE_MS;
  }

  function submit(force) {
    if (submitted) { return; }
    if (firstEventT === null) { return; }
    if (!force && elapsed() < MIN_OBSERVE_MS) { return; }
    submitted = true;
    label.textContent = '上报中...';
    var events = buffer.events;
    var analysis = core.analyze(events);
    var stats = core.computeStats(events);
    var trajectory = core.buildTrajectory(events, 600);
    var payload = {
      script: 'plugin-behavior-v1',
      kind: 'behavior',
      collectedAt: new Date().toISOString(),
      pageContext: {
        url: location.href.slice(0, 800),
        title: (document.title || '').slice(0, 200),
        entrySlug: SLUG,
        module: true
      },
      behavior: {
        session: { durationMs: Math.round(elapsed()), eventCounts: core.eventCounts(events) },
        stageMarks: stageMarks.slice(0, 60),
        signals: analysis.signals,
        score: analysis.score,
        verdict: analysis.verdict,
        confidence: analysis.confidence,
        stats: stats,
        trajectory: trajectory
      },
      errors: [],
      durationMs: Math.round(performance.now() - t0)
    };
    fetch(PLATFORM + '/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: SLUG, kind: 'behavior', payload: payload,
        summary: { script: 'plugin-behavior-v1', score: analysis.score, verdict: analysis.verdict,
          dimensions: payload.behavior.session.eventCounts },
        duration_ms: payload.durationMs
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        label.textContent = '已上报: score=' + analysis.score + ' ' + analysis.verdict;
        submitBtn.disabled = true;
      } else {
        label.textContent = '上报失败: ' + ((r.data && r.data.detail) || 'error');
        submitted = false;
      }
    }).catch(function (e) {
      label.textContent = '上报失败: ' + e.message;
      submitted = false;
    });
  }

  window.__fpBehavior = {
    mark: function (name) {
      if (submitted) { return; }
      stageMarks.push({ name: String(name).slice(0, 60), t: Math.round(elapsed()) });
      updateBar();
    },
    submit: function () { submit(true); },
    hideBar: function () { if (bar.parentNode) { bar.parentNode.removeChild(bar); } }
  };

  updateBar();
  setInterval(updateBar, 1000);
})();
