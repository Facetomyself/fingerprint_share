/* fingerprint_share 平台侧采集执行器（聚合模式）
 * 契约：window.__fp_submit(payload) 由平台注入；采集脚本可多次调用
 * （组合采集：风控专有脚本 + 通用深度脚本），执行器聚合为一条记录上报：
 *   - components 深度合并（后提交覆盖同名组件）
 *   - deepProbes.lies/trash/resistance 合并
 *   - errors 拼接去重
 *   - payload.scripts 记录贡献脚本名列表
 * 聚合窗口：最后一次提交后 600ms 内到达的 payload 并入同一条记录。
 */
(function () {
  'use strict';

  var pathMatch = location.pathname.match(/^\/collect\/([^/]+)/);
  var entrySlug = pathMatch ? decodeURIComponent(pathMatch[1]) : '';
  var submitted = false;
  var pendingPayloads = [];
  var flushTimer = null;
  var statusEl = document.getElementById('fp-status');

  function setStatus(text, isError) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.className = 'status' + (isError ? ' error' : ' ok');
    }
  }

  // 15 秒未提交视为采集失败（兜底提示，不阻断页面）
  setTimeout(function () {
    if (!submitted) {
      setStatus('采集超时：脚本 15 秒内未调用 __fp_submit，请检查脚本或网络环境', true);
    }
  }, 15000);

  function mergePayloads(payloads) {
    var merged = {
      script: payloads[payloads.length - 1].script,
      scripts: payloads.map(function (p) { return p.script; }),
      kind: 'environment',
      collectedAt: new Date().toISOString(),
      components: {},
      deepProbes: { lies: {}, trash: {}, resistance: {} },
      errors: [],
      durationMs: 0
    };
    var seenErrors = {};
    payloads.forEach(function (p) {
      Object.keys(p.components || {}).forEach(function (k) {
        merged.components[k] = p.components[k];
      });
      var dp = p.deepProbes || {};
      ['lies', 'trash', 'resistance'].forEach(function (group) {
        if (dp[group] && typeof dp[group] === 'object') {
          Object.keys(dp[group]).forEach(function (k) {
            merged.deepProbes[group][k] = dp[group][k];
          });
        }
      });
      (p.errors || []).forEach(function (e) {
        if (!seenErrors[e]) {
          seenErrors[e] = true;
          merged.errors.push(e);
        }
      });
      if (typeof p.durationMs === 'number') {
        merged.durationMs += p.durationMs;
      }
      if (p.visitorId) {
        merged.visitorId = p.visitorId;
      }
    });
    return merged;
  }

  function flush() {
    if (submitted || !pendingPayloads.length) { return; }
    submitted = true;
    var merged = mergePayloads(pendingPayloads);
    pendingPayloads = [];
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

    var dims = Object.keys(merged.components).filter(function (k) {
      return merged.components[k] !== null && merged.components[k] !== undefined;
    }).length;

    fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_slug: entrySlug,
        kind: 'environment',
        payload: merged,
        summary: {
          scripts: merged.scripts,
          visitorId: merged.visitorId ? merged.visitorId : null,
          dimensions: dims,
          errors: merged.errors
        },
        duration_ms: merged.durationMs
      })
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, status: resp.status, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        setStatus('采集完成并已上报：脚本=' + merged.scripts.join('+') +
          '，visitorId=' + (merged.visitorId || '-').slice(0, 20) + '...' +
          '，维度=' + dims + '，耗时=' + merged.durationMs + 'ms');
      } else {
        var detail = r.data && r.data.detail ? r.data.detail : ('HTTP ' + r.status);
        setStatus('上报失败：' + detail, true);
      }
    }).catch(function (e) {
      setStatus('上报失败：' + e.message, true);
    });
  }

  window.__fp_submit = function (payload) {
    if (submitted) { return; }
    if (!payload || typeof payload !== 'object') {
      setStatus('提交失败：payload 必须是对象', true);
      return;
    }
    pendingPayloads.push(payload);
    // 聚合窗口：等待其他脚本的提交（组合采集）
    if (flushTimer) { clearTimeout(flushTimer); }
    flushTimer = setTimeout(flush, 600);
    setStatus('收到采集脚本 ' + (payload.script || 'unknown') + ' 的提交，聚合中...');
  };

  window.__fp_ready = true;
})();
