/* 后台管理逻辑：登录态检查、条目 CRUD、记录清理 */

(function () {
  'use strict';

  var statusEl = document.getElementById('admin-status');
  var entriesRoot = document.getElementById('entries-root');
  var createForm = document.getElementById('create-form');
  var editForm = document.getElementById('edit-form');
  var deleteForm = document.getElementById('delete-collection-form');
  var logoutLink = document.getElementById('logout-link');

  function showStatus(text, isError) {
    statusEl.className = 'status' + (isError ? ' error' : ' ok');
    statusEl.textContent = text;
  }

  function hideStatus() { statusEl.className = 'hidden'; }

  // 未登录则跳登录页
  fetchJson('/api/admin/me').catch(function (err) {
    if (err.status === 401) { location.href = '/admin/login'; }
  });

  function loadEntries() {
    return fetchJson('/api/admin/entries').then(function (entries) {
      if (!entries.length) {
        entriesRoot.innerHTML = '<div class="status">暂无条目。</div>';
        return entries;
      }
      var html = '<table><tr><th>ID</th><th>名称</th><th>slug</th><th>版本</th>' +
        '<th>更新时间 (UTC)</th><th>操作</th></tr>';
      entries.forEach(function (e) {
        html += '<tr><td>' + e.id + '</td><td>' + escapeHtml(e.name) + '</td>' +
          '<td><code>' + escapeHtml(e.slug) + '</code></td><td>' + escapeHtml(e.version) + '</td>' +
          '<td>' + escapeHtml(shortTime(e.updated_at)) + '</td>' +
          '<td><a href="#" class="edit-link" data-slug="' + escapeHtml(e.slug) + '">编辑</a> ' +
          '<a href="#" class="delete-link" data-slug="' + escapeHtml(e.slug) + '" style="color:#cf222e;">删除</a></td></tr>';
      });
      html += '</table>';
      entriesRoot.innerHTML = html;

      Array.prototype.forEach.call(entriesRoot.querySelectorAll('.edit-link'), function (link) {
        link.onclick = function (ev) {
          ev.preventDefault();
          var slug = link.getAttribute('data-slug');
          var entry = entries.find(function (e) { return e.slug === slug; });
          if (entry) { openEdit(entry); }
        };
      });
      Array.prototype.forEach.call(entriesRoot.querySelectorAll('.delete-link'), function (link) {
        link.onclick = function (ev) {
          ev.preventDefault();
          var slug = link.getAttribute('data-slug');
          if (confirm('删除条目 ' + slug + ' 及其全部采集记录？此操作不可恢复。')) {
            fetchJson('/api/admin/entries/' + encodeURIComponent(slug), { method: 'DELETE' })
              .then(function () {
                showStatus('条目已删除');
                loadEntries();
              })
              .catch(function (err) { showStatus('删除失败：' + err.message, true); });
          }
        };
      });
      return entries;
    }).catch(function (err) {
      entriesRoot.innerHTML = '<div class="status error">加载失败：' + escapeHtml(err.message) + '</div>';
      return [];
    });
  }

  function openEdit(entry) {
    editForm.classList.remove('hidden');
    document.getElementById('e-slug').value = entry.slug;
    document.getElementById('e-name').value = entry.name;
    document.getElementById('e-version').value = entry.version;
    document.getElementById('e-desc').value = entry.description || '';
    document.getElementById('e-js').value = entry.collect_js;
    document.getElementById('e-behavior').checked = !!entry.has_behavior;
    editForm.scrollIntoView();
  }

  createForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideStatus();
    var body = {
      name: document.getElementById('c-name').value.trim(),
      version: document.getElementById('c-version').value.trim(),
      description: document.getElementById('c-desc').value.trim(),
      has_behavior: document.getElementById('c-behavior').checked ? 1 : 0,
      collect_js: document.getElementById('c-js').value
    };
    fetchJson('/api/admin/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (entry) {
      showStatus('条目已创建：' + entry.slug);
      createForm.reset();
      document.getElementById('c-version').value = 'v1';
      loadEntries();
    }).catch(function (err) {
      showStatus('上传失败：' + err.message, true);
    });
  });

  editForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideStatus();
    var slug = document.getElementById('e-slug').value;
    var body = {
      name: document.getElementById('e-name').value.trim(),
      version: document.getElementById('e-version').value.trim(),
      description: document.getElementById('e-desc').value.trim(),
      has_behavior: document.getElementById('e-behavior').checked ? 1 : 0,
      collect_js: document.getElementById('e-js').value
    };
    fetchJson('/api/admin/entries/' + encodeURIComponent(slug), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function () {
      showStatus('条目已更新：' + slug);
      editForm.classList.add('hidden');
      loadEntries();
    }).catch(function (err) {
      showStatus('保存失败：' + err.message, true);
    });
  });

  document.getElementById('edit-cancel').addEventListener('click', function () {
    editForm.classList.add('hidden');
  });

  deleteForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideStatus();
    var id = document.getElementById('d-collection-id').value.trim();
    if (!/^\d+$/.test(id)) {
      showStatus('记录 ID 必须是数字', true);
      return;
    }
    fetchJson('/api/admin/collections/' + id, { method: 'DELETE' })
      .then(function () {
        showStatus('记录 #' + id + ' 已删除');
        deleteForm.reset();
      })
      .catch(function (err) { showStatus('删除失败：' + err.message, true); });
  });

  logoutLink.addEventListener('click', function (ev) {
    ev.preventDefault();
    fetchJson('/api/admin/logout', { method: 'POST' })
      .catch(function () { /* 忽略登出接口错误 */ })
      .then(function () { location.href = '/admin/login'; });
  });

  loadEntries();
})();
