/* 行为采集生命周期壳：事件监听、提示 UI、提交时机、上报 kind=behavior */
(function () {
  'use strict';

  var pathMatch = location.pathname.match(/^\/collect\/([^/]+)\/behavior/);
  var entrySlug = pathMatch ? decodeURIComponent(pathMatch[1]) : '';
  var core = window.behaviorCore;
  if (!core) {
    document.getElementById('bh-status').textContent = '错误：behavior-core.js 未加载';
    return;
  }

  var buffer = core.createBuffer();
  var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var firstEventT = null;
  var submitted = false;
  var AUTO_MS = 30000;
  var HARD_TIMEOUT_MS = 45000;
  var MIN_OBSERVE_MS = 3000;

  var statusEl = document.getElementById('bh-status');
  var countEl = document.getElementById('bh-count');
  var timerEl = document.getElementById('bh-timer');
  var submitBtn = document.getElementById('bh-submit');
  var inputDemo = document.getElementById('bh-input-demo');

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (isError ? ' error' : '');
  }

  function elapsed() {
    return firstEventT === null ? 0 : now() - firstEventT;
  }

  function updateTimerUi() {
    var total = buffer.events.length;
    countEl.textContent = '已记录 ' + total + ' 个事件';
    if (firstEventT === null) {
      timerEl.textContent = '等待首次交互...';
    } else if (submitted) {
      timerEl.textContent = '';
    } else {
      var remain = Math.max(0, Math.round((AUTO_MS - elapsed()) / 1000));
      timerEl.textContent = '剩余 ' + remain + ' 秒自动上报';
    }
    if (!submitted) {
      submitBtn.disabled = firstEventT === null || elapsed() < MIN_OBSERVE_MS;
    }
  }

  function emit(ty, extra) {
    if (submitted) { return; }
    var t = now() - t0;
    var ev = { t: t, ty: ty };
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
    updateTimerUi();
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
      isTrusted: e.isTrusted
    });
  });

  document.addEventListener('click', function (e) {
    emit('c', {
      x: e.clientX, y: e.clientY,
      px: e.pageX, sx: e.screenX,
      clickDetail: e.detail || 0,
      isTrusted: e.isTrusted
    });
  });

  document.addEventListener('touchstart', function (e) {
    emit('t', {
      x: e.touches[0] ? e.touches[0].clientX : 0,
      y: e.touches[0] ? e.touches[0].clientY : 0,
      phase: 'start',
      touchCount: e.touches.length,
      isTrusted: e.isTrusted
    });
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    emit('t', {
      x: e.touches[0] ? e.touches[0].clientX : 0,
      y: e.touches[0] ? e.touches[0].clientY : 0,
      phase: 'move',
      touchCount: e.touches.length,
      isTrusted: e.isTrusted
    });
  }, { passive: true });

  function buildPayload() {
    var events = buffer.events;
    var analysis = core.analyze(events);
    var stats = core.computeStats(events);
    var trajectory = core.buildTrajectory(events, 600);
    return {
      script: 'behavior-collector-v1',
      kind: 'behavior',
      collectedAt: new Date().toISOString(),
      behavior: {
        session: {
          durationMs: Math.round(elapsed()),
          eventCounts: core.eventCounts(events)
        },
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
  }

  function submit() {
    if (submitted) { return; }
    submitted = true;
    submitBtn.disabled = true;
    setStatus('正在上报行为指纹...');
    var payload = buildPayload();
    fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: entrySlug,
        kind: 'behavior',
        payload: payload,
        summary: {
          script: 'behavior-collector-v1',
          score: payload.behavior.score,
          verdict: payload.behavior.verdict,
          dimensions: payload.behavior.session.eventCounts
        },
        duration_ms: payload.durationMs
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, status: resp.status, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        var b = payload.behavior;
        setStatus('上报完成：score=' + b.score + '，判定=' + (b.verdict === 'legit' ? '正常' : '可疑') +
          '，置信度=' + b.confidence + '，事件=' + b.trajectory.totalEvents +
          '，轨迹点=' + b.trajectory.sampled);
        timerEl.textContent = '会话时长 ' + Math.round(b.session.durationMs / 1000) + ' 秒';
      } else {
        var detail = r.data && r.data.detail ? r.data.detail : ('HTTP ' + r.status);
        setStatus('上报失败：' + detail, true);
        submitted = false;
        submitBtn.disabled = false;
      }
    }).catch(function (e) {
      setStatus('上报失败：' + e.message, true);
      submitted = false;
      submitBtn.disabled = false;
    });
  }

  submitBtn.addEventListener('click', function () {
    if (!submitted && firstEventT !== null && elapsed() >= MIN_OBSERVE_MS) {
      submit();
    }
  });

  // 10s 零事件兜底提示
  setTimeout(function () {
    if (!submitted && buffer.events.length === 0) {
      setStatus('尚未检测到交互。请移动鼠标、点击页面或滚动以开始行为采集。', true);
    }
  }, 10000);

  // 45s 硬超时强制提交
  setTimeout(function () {
    if (!submitted && buffer.events.length > 0) { submit(); }
  }, HARD_TIMEOUT_MS);

  window.addEventListener('beforeunload', function () {
    if (!submitted && buffer.events.length > 0 && elapsed() >= MIN_OBSERVE_MS) {
      var payload = buildPayload();
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/ingest', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({
          entry_slug: entrySlug,
          kind: 'behavior',
          payload: payload,
          summary: { script: 'behavior-collector-v1', score: payload.behavior.score, verdict: payload.behavior.verdict },
          duration_ms: payload.durationMs
        }));
      } catch (e) { /* 尽力提交，忽略失败 */ }
    }
  });

  // 输入示例框：行为页自带的打字目标
  if (inputDemo) {
    inputDemo.addEventListener('focus', function () { /* 聚焦无动作，打字由 keydown 捕获 */ });
  }

  updateTimerUi();
  setInterval(updateTimerUi, 1000);
})();
