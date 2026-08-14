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
  // 组合采集预期脚本清单（由采集页注入）：收齐后立即聚合上报；
  // 未配置时按 600ms 窗口；首提交后 10s 未收齐也强制上报已收到的。
  var expectedScripts = window.__FP_EXPECTED_SCRIPTS || null;
  var firstSubmitAt = null;
  var forcedAt = null;

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

  var DEDUP_KEY = 'fp_collect_last';
  var DEDUP_WINDOW_MS = 5 * 60 * 1000;

  function flush() {
    if (submitted || !pendingPayloads.length) { return; }
    // 同浏览器去重：5 分钟内已采集过则跳过（防标签恢复/后台重载等重复执行）
    try {
      var last = Number(localStorage.getItem(DEDUP_KEY) || 0);
      if (last && Date.now() - last < DEDUP_WINDOW_MS) {
        submitted = true;
        pendingPayloads = [];
        setStatus('近期已采集（5 分钟内），跳过重复上报。如需重新采集请稍后再试。');
        return;
      }
    } catch (e) { /* localStorage 不可用时跳过去重 */ }
    submitted = true;
    var merged = mergePayloads(pendingPayloads);
    pendingPayloads = [];
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (forcedAt) { clearTimeout(forcedAt); forcedAt = null; }

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
        try { localStorage.setItem(DEDUP_KEY, String(Date.now())); } catch (e) { /* 忽略 */ }
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
    if (firstSubmitAt === null) {
      firstSubmitAt = Date.now();
      // 首提交后 10s 兜底：无论是否收齐预期脚本，强制上报已收到的
      forcedAt = setTimeout(flush, 10000);
    }
    pendingPayloads.push(payload);
    var receivedNames = pendingPayloads.map(function (p) { return p.script; });
    var complete = expectedScripts &&
      expectedScripts.every(function (s) { return receivedNames.indexOf(s) >= 0; });
    setStatus('收到采集脚本 ' + (payload.script || 'unknown') + ' 的提交' +
      (expectedScripts
        ? '（' + receivedNames.length + '/' + expectedScripts.length + '）'
        : '') + (complete ? '，全部就绪，正在上报...' : '，等待其余脚本...'));
    if (complete) {
      flush();
    } else if (!expectedScripts) {
      // 未配置清单：600ms 聚合窗口
      if (flushTimer) { clearTimeout(flushTimer); }
      flushTimer = setTimeout(flush, 600);
    }
  };

  window.__fp_ready = true;
})();
