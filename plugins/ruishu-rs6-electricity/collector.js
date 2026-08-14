/* 插件内上报桥：平台注入 window.__fp_submit(payload) */
(function () {
  'use strict';
  var PLATFORM = 'http://106.15.239.221:8000';
  var SLUG = 'ruishu-rs6-electricity';
  var submitted = false;
  var statusEl = document.getElementById('fp-status');

  function setStatus(text, cls) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.className = cls || '';
    }
  }

  window.__fp_submit = function (payload) {
    if (submitted) { return; }
    submitted = true;
    fetch(PLATFORM + '/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: SLUG,
        kind: 'environment',
        payload: payload,
        summary: {
          script: payload && payload.script ? payload.script : null,
          visitorId: payload && payload.visitorId ? payload.visitorId : null,
          dimensions: payload && payload.components
            ? Object.keys(payload.components).filter(function (k) { return payload.components[k] !== null; }).length : 0,
          errors: payload && payload.errors ? payload.errors : []
        },
        duration_ms: payload && typeof payload.durationMs === 'number' ? payload.durationMs : null
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, status: resp.status, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        setStatus('采集完成并已上报：visitorId=' + ((payload && payload.visitorId) || '-').slice(0, 24) +
          '...，耗时=' + ((payload && payload.durationMs) || 0) + 'ms', 'fp-status ok');
      } else {
        setStatus('上报失败：' + ((r.data && r.data.detail) || ('HTTP ' + r.status)), 'fp-status error');
      }
    }).catch(function (e) {
      setStatus('上报失败：' + e.message, 'fp-status error');
    });
  };
})();
