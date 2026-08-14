/* popup：打开插件内采集页/剧本页 */
(function () {
  'use strict';
  var SLUG = 'imperva-canadiannorth.com';
  function openPage(name) {
    chrome.tabs.create({ url: chrome.runtime.getURL(name) });
  }
  document.getElementById('btn-collect').addEventListener('click', function () {
    openPage('collect.html');
  });
  var btnChallenge = document.getElementById('btn-challenge');
  if (btnChallenge) {
    btnChallenge.addEventListener('click', function () {
      openPage('challenge.html');
    });
  }
  document.getElementById('btn-readme').addEventListener('click', function () {
    openPage('README.md');
  });
})();
