/* page-behavior 页面模块行为采集层
 * 由平台自动注入条目级复刻页面模块（行为剧本页）。
 * 职责：事件流采集 + 12 信号分析 + 剧本阶段标记 + 上报 kind=behavior。
 * 模块剧本通过 window.__fpBehavior 挂钩：
 *   __fpBehavior.mark(stage)   标记剧本阶段流转（复刻流程时序研究点）
 *   __fpBehavior.submit()      立即提交（模块流程完成时调用）
 *   __fpBehavior.hideBar()     隐藏悬浮指示条（模块自带 UI 时）
 * 模块页面 UI 由模块自身复刻（平台不加任何结构），采集发生在复刻页面上。
 */
(function () {
  'use strict';

  var core = window.behaviorCore;
  var entrySlug = window.__FP_ENTRY_SLUG || 'generic-deep-v3';
  var entryName = window.__FP_ENTRY_NAME || entrySlug;
  if (!core) { return; }

  var buffer = core.createBuffer();
  var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var firstEventT = null;
  var submitted = false;
  var stageMarks = [];
  var AUTO_MS = 30000;
  var HARD_TIMEOUT_MS = 45000;
  var MIN_OBSERVE_MS = 3000;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function elapsed() {
    return firstEventT === null ? 0 : now() - firstEventT;
  }

  // ---------- 事件监听（复刻页面真实交互） ----------

  function emit(ty, extra) {
    if (submitted) { return; }
    var ev = { t: now() - t0, ty: ty };
    if (extra) {
      Object.keys(extra).forEach(function (k) { ev[k] = extra[k]; });
    }
    if (firstEventT === null) {
      firstEventT = now();
      setTimeout(function () {
        if (!submitted && elapsed() >= AUTO_MS) { submit(); }
      }, AUTO_MS);
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

  // ---------- 悬浮指示条（最小侵入，模块可隐藏；body 未就绪时等待） ----------

  var bar = document.createElement('div');
  bar.id = '__fp_page_bar';
  bar.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;' +
    'background:rgba(20,20,30,0.86);backdrop-filter:blur(14px);color:#f5f5f7;' +
    'font:12px -apple-system,"Segoe UI",sans-serif;border-radius:12px;' +
    'border:1px solid rgba(255,255,255,0.12);padding:10px 12px;' +
    'display:flex;gap:8px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
  var label = document.createElement('span');
  label.textContent = '行为采集: 0 事件';
  label.style.color = '#b6b6c2';
  var btnStyle = 'background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.16);' +
    'color:#fff;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;';
  var submitBtn = document.createElement('button');
  submitBtn.textContent = '提交';
  submitBtn.style.cssText = btnStyle;
  submitBtn.disabled = true;
  submitBtn.onclick = function () { submit(); };
  bar.appendChild(label);
  bar.appendChild(submitBtn);
  function mountBar() {
    if (document.body) {
      document.body.appendChild(bar);
    } else {
      setTimeout(mountBar, 50);
    }
  }
  mountBar();

  function updateBar() {
    if (submitted) { return; }
    var remain = firstEventT === null ? '' : ' · 剩 ' + Math.max(0, Math.round((AUTO_MS - elapsed()) / 1000)) + 's';
    label.textContent = '行为采集: ' + buffer.events.length + ' 事件' + remain +
      (stageMarks.length ? ' · ' + stageMarks[stageMarks.length - 1].name : '');
    submitBtn.disabled = firstEventT === null || elapsed() < MIN_OBSERVE_MS;
  }

  // ---------- 提交 ----------

  function submit(force) {
    if (submitted) { return; }
    if (firstEventT === null) { return; }
    // 模块剧本完成时的主动提交不受最小观察窗口限制（阶段标记已证明流程完整）；
    // 自动提交路径（30s 定时/悬浮条按钮）保持 3s 最小观察。
    if (!force && elapsed() < MIN_OBSERVE_MS) { return; }
    submitted = true;
    label.textContent = '上报中...';
    var events = buffer.events;
    var analysis = core.analyze(events);
    var stats = core.computeStats(events);
    var trajectory = core.buildTrajectory(events, 600);
    var payload = {
      script: 'page-behavior-v1',
      kind: 'behavior',
      collectedAt: new Date().toISOString(),
      pageContext: {
        url: location.href.slice(0, 800),
        title: (document.title || '').slice(0, 200),
        entrySlug: entrySlug,
        entryName: entryName,
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
      durationMs: Math.round(now() - t0)
    };
    fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: entrySlug,
        kind: 'behavior',
        payload: payload,
        summary: {
          script: 'page-behavior-v1',
          score: analysis.score,
          verdict: analysis.verdict,
          dimensions: payload.behavior.session.eventCounts
        },
        duration_ms: payload.durationMs
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        label.textContent = '已上报: score=' + analysis.score + ' ' + analysis.verdict +
          ' · ' + trajectory.totalEvents + ' 事件';
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

  setTimeout(function () {
    if (!submitted && buffer.events.length > 0) { submit(); }
  }, HARD_TIMEOUT_MS);

  // ---------- 模块挂钩 API ----------

  window.__fpBehavior = {
    mark: function (stageName) {
      if (submitted) { return; }
      stageMarks.push({
        name: String(stageName).slice(0, 60),
        t: Math.round(elapsed())
      });
      updateBar();
    },
    submit: function () { submit(true); },
    hideBar: function () {
      if (bar.parentNode) { bar.parentNode.removeChild(bar); }
    },
    status: function () {
      return { events: buffer.events.length, submitted: submitted, stages: stageMarks.slice() };
    }
  };

  updateBar();
  setInterval(updateBar, 1000);
})();
