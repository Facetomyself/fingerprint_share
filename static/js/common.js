/* 前端共用工具：fetch 包装、路径参数解析、页面渲染辅助 */

function fetchJson(url, options) {
  return fetch(url, options).then(function (resp) {
    return resp.json().then(function (data) {
      if (!resp.ok) {
        var detail = data && data.detail ? data.detail : ('HTTP ' + resp.status);
        var err = new Error(String(detail));
        err.status = resp.status;
        throw err;
      }
      return data;
    });
  });
}

function pathSegments() {
  // /e/<slug> -> ['e', '<slug>']
  return location.pathname.split('/').filter(function (s) { return s !== ''; });
}

function queryParam(name) {
  var params = new URLSearchParams(location.search);
  return params.get(name);
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text === null || text === undefined ? '' : String(text);
  return div.innerHTML;
}

function shortTime(iso) {
  if (!iso) { return '-'; }
  return iso.replace('T', ' ').slice(0, 19);
}

function groupBy(list, keyFn) {
  var groups = {};
  list.forEach(function (item) {
    var key = keyFn(item) || '未分组';
    (groups[key] = groups[key] || []).push(item);
  });
  return groups;
}
