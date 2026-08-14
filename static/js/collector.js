/* fingerprint_share 平台侧采集执行器
 * 契约：window.__fp_submit(payload) 由平台注入；上传的采集脚本只采集并最终调用它。
 * 本文件负责：入口 slug 解析、上报 POST /api/ingest、超时兜底、页面状态展示。
 */
(function () {
  'use strict';

  var pathMatch = location.pathname.match(/^\/collect\/([^/]+)/);
  var entrySlug = pathMatch ? decodeURIComponent(pathMatch[1]) : '';
  var submitted = false;
  var statusEl = document.getElementById('fp-status');

  function setStatus(text, isError) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.className = 'status' + (isError ? ' error' : ' ok');
    }
  }

  // 15 秒未提交视为采集失败（兜底提示，不阻断页面）
  var timeoutId = setTimeout(function () {
    if (!submitted) {
      setStatus('采集超时：脚本 15 秒内未调用 __fp_submit，请检查脚本或网络环境', true);
    }
  }, 15000);

  function makeSummary(payload) {
    var dims = 0;
    if (payload && payload.components) {
      Object.keys(payload.components).forEach(function (k) {
        if (payload.components[k] !== null && payload.components[k] !== undefined) { dims += 1; }
      });
    }
    return {
      script: payload && payload.script ? payload.script : null,
      visitorId: payload && payload.visitorId ? payload.visitorId : null,
      dimensions: dims,
      errors: payload && Array.isArray(payload.errors) ? payload.errors : []
    };
  }

  window.__fp_submit = function (payload) {
    if (submitted) { return; }
    submitted = true;
    clearTimeout(timeoutId);

    if (!payload || typeof payload !== 'object') {
      setStatus('提交失败：payload 必须是对象', true);
      return;
    }

    fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: entrySlug,
        payload: payload,
        summary: makeSummary(payload),
        duration_ms: (payload && typeof payload.durationMs === 'number') ? payload.durationMs : null
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, status: resp.status, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        var dims = 0;
        if (payload.components) {
          Object.keys(payload.components).forEach(function (k) {
            if (payload.components[k] !== null && payload.components[k] !== undefined) { dims += 1; }
          });
        }
        setStatus('采集完成并已上报：visitorId=' + (payload.visitorId || '-') +
          '，维度=' + dims + '，耗时=' + (payload.durationMs || 0) + 'ms');
      } else {
        var detail = r.data && r.data.detail ? r.data.detail : ('HTTP ' + r.status);
        setStatus('上报失败：' + detail, true);
      }
    }).catch(function (e) {
      setStatus('上报失败：' + e.message, true);
    });
  };

  window.__fp_ready = true;
})();
