/* behavior-core 纯函数测试（无框架，node 直跑，退出码非 0 即失败） */
'use strict';
var path = require('path');
var core = require(path.join(__dirname, '..', '..', 'static', 'js', 'behavior-core.js'));

var failures = 0;
function assert(cond, name) {
  if (!cond) {
    failures += 1;
    console.log('FAIL: ' + name);
  } else {
    console.log('ok: ' + name);
  }
}

// 1. linear-typing：30 次等间隔 25ms 打字
var b1 = core.createBuffer();
for (var i = 0; i < 30; i++) {
  core.pushEvent(b1, { t: i * 25, ty: 'k', keyLen: 1, repeat: false, isTrusted: true });
}
var a1 = core.analyze(b1.events);
var typing = a1.signals.filter(function (s) { return s.id === 'linear-typing'; })[0];
assert(typing.triggered === true, 'linear-typing triggered on uniform 25ms typing');

// 2. teleport：100ms 内 700px
var b2 = core.createBuffer();
core.pushEvent(b2, { t: 0, ty: 'm', x: 0, y: 0, dx: 1, dy: 0, isTrusted: true });
core.pushEvent(b2, { t: 50, ty: 'm', x: 700, y: 0, dx: 1, dy: 0, isTrusted: true });
var a2 = core.analyze(b2.events);
var tp = a2.signals.filter(function (s) { return s.id === 'teleport-mouse'; })[0];
assert(tp.triggered === true, 'teleport-mouse triggered on 700px/50ms');

// 3. zero-deltas：51 个全零 delta
var b3 = core.createBuffer();
for (var j = 0; j < 51; j++) {
  core.pushEvent(b3, { t: j * 10, ty: 'm', x: 100, y: 100, dx: 0, dy: 0, isTrusted: true });
}
var a3 = core.analyze(b3.events);
var zd = a3.signals.filter(function (s) { return s.id === 'zero-mouse-movement-deltas'; })[0];
assert(zd.triggered === true, 'zero-deltas triggered on 51 zero-delta events');

// 4. synthetic：isTrusted=false
var b4 = core.createBuffer();
core.pushEvent(b4, { t: 0, ty: 'm', x: 1, y: 1, dx: 1, dy: 1, isTrusted: false });
var a4 = core.analyze(b4.events);
assert(a4.signals[0].triggered === true, 'synthetic-events triggered');
assert(Math.abs(a4.score - 0.5) < 1e-9, 'score = 1-(1-0.5) = 0.5');
assert(a4.verdict === 'legit', 'verdict legit below 0.55');

// 5. 降采样 1200 -> 600 且保首尾
var b5 = core.createBuffer();
for (var k = 0; k < 1200; k++) {
  core.pushEvent(b5, { t: k, ty: 'm', x: k % 800, y: k % 600, dx: 1, dy: 1, isTrusted: true });
}
var traj = core.buildTrajectory(b5.events, 600);
assert(traj.sampled <= 600, 'downsample <= 600 points (got ' + traj.sampled + ')');
assert(traj.points[0].t === 0 && traj.points[traj.points.length - 1].t === 1199, 'first/last preserved');

// 6. rapid-click：80ms 间隔 5 连点
var b6 = core.createBuffer();
for (var c = 0; c < 5; c++) {
  core.pushEvent(b6, { t: c * 80, ty: 'c', x: 50, y: 50, clickDetail: 1, isTrusted: true });
}
var a6 = core.analyze(b6.events);
var rc = a6.signals.filter(function (s) { return s.id === 'rapid-click-interval'; })[0];
assert(rc.triggered === true, 'rapid-click triggered on 5x80ms clicks');

// 7. 空样本：confidence low
var a7 = core.analyze([]);
assert(a7.confidence === 'low', 'empty sample confidence low');
assert(a7.score === 0, 'empty sample score 0');

// 8. linear-mouse：直线匀速（14 采样滑动窗口）
var b8 = core.createBuffer();
for (var m = 0; m < 40; m++) {
  core.pushEvent(b8, { t: m * 10, ty: 'm', x: m * 5, y: 300, dx: 5, dy: 0, isTrusted: true });
}
var a8 = core.analyze(b8.events);
var lm = a8.signals.filter(function (s) { return s.id === 'linear-mouse-movement'; })[0];
assert(lm.triggered === true, 'linear-mouse triggered on straight uniform line');

// 9. cdp-coordinate-leak：px===sx 两个位置
var b9 = core.createBuffer();
core.pushEvent(b9, { t: 0, ty: 'm', x: 10, y: 10, dx: 1, dy: 1, px: 100, sx: 100, isTrusted: true });
core.pushEvent(b9, { t: 10, ty: 'm', x: 11, y: 11, dx: 1, dy: 1, px: 100, sx: 100, isTrusted: true });
core.pushEvent(b9, { t: 20, ty: 'm', x: 20, y: 20, dx: 1, dy: 1, px: 200, sx: 200, isTrusted: true });
core.pushEvent(b9, { t: 30, ty: 'm', x: 21, y: 21, dx: 1, dy: 1, px: 200, sx: 200, isTrusted: true });
var a9 = core.analyze(b9.events);
var cdp = a9.signals.filter(function (s) { return s.id === 'cdp-input-coordinate-leak'; })[0];
assert(cdp.triggered === true, 'cdp-coordinate-leak triggered on 2 px==sx positions');

// 10. stats：1200 点统计
var st = core.computeStats(b5.events);
assert(st.intervalHistogram.length === 8, 'histogram has 8 buckets');
assert(st.directionTurns >= 0, 'direction turns non-negative');

// 11. 60s 窗口剪枝
var b11 = core.createBuffer();
core.pushEvent(b11, { t: 0, ty: 'm', x: 0, y: 0, dx: 1, dy: 1, isTrusted: true });
core.pushEvent(b11, { t: 70000, ty: 'm', x: 1, y: 1, dx: 1, dy: 1, isTrusted: true });
assert(b11.events.length === 1, '60s window pruning drops old event');

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
