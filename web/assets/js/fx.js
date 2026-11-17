/* ==========================================================
   打砖块 · 屏幕反馈（震屏 / 闪屏）
   刻意不用 CSS @keyframes：某些 WebView2 环境里
   「被提升为合成层的 CSS animation 这一帧不绘制」，
   于是整段动画看起来根本没发生。这里全部用 rAF 逐帧写样式。
   对外暴露 window.FX。
   作者：某好心市民
   ========================================================== */

(function () {
  'use strict';

  var shakeEnabled = false;
  var app = null;
  var flashEl = null;

  var shakeId = 0;          // 0 表示当前没有抖动
  var shakeStart = -1;
  var shakeDur = 200;
  var shakeAmp = 4;

  var flashId = 0;
  var flashStart = -1;
  var flashDur = 260;

  function now() { return performance.now(); }

  function getApp() {
    if (!app) app = document.getElementById('app');
    return app;
  }

  function getFlash() {
    if (!flashEl) flashEl = document.getElementById('flash');
    return flashEl;
  }

  /** 正弦衰减的位移，肉眼看起来像"顿一下" */
  function shakeTick() {
    var el = getApp();
    if (!el) { shakeId = 0; return; }

    var t = (now() - shakeStart) / shakeDur;
    if (t < 0) t = 0;
    if (t >= 1) {
      el.style.transform = '';
      shakeId = 0;
      return;
    }

    var decay = 1 - t;                       // 线性衰减
    var amp = shakeAmp * decay;
    var dx = Math.sin(t * Math.PI * 8) * amp;
    var dy = Math.cos(t * Math.PI * 6.4) * amp * 0.72;
    el.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)';
    shakeId = requestAnimationFrame(shakeTick);
  }

  function flashTick() {
    var el = getFlash();
    if (!el) { flashId = 0; return; }

    var t = (now() - flashStart) / flashDur;
    if (t < 0) t = 0;
    if (t >= 1) {
      el.style.opacity = '0';
      flashId = 0;
      return;
    }

    var o = 0.42 * (1 - t) * (1 - t);        // 二次衰减，收得更快
    el.style.opacity = String(o.toFixed(3));
    flashId = requestAnimationFrame(flashTick);
  }

  var FX = {

    get shakeEnabled() { return shakeEnabled; },
    set shakeEnabled(v) { shakeEnabled = !!v; },

    /** 轻微震屏，越强的小球冲击可以传更大的 amp */
    shake: function (amp) {
      if (!shakeEnabled) return;
      shakeAmp = (typeof amp === 'number' && amp > 0) ? amp : 4;
      shakeDur = 200;
      shakeStart = now();

      if (!shakeId) {
        shakeId = requestAnimationFrame(shakeTick);
      } else {
        // 已经在抖，重新计时即可（不叠加新的 rAF 链）
        shakeStart = shakeStart;
        if (shakeStart < 0) shakeStart = now();
      }
    },

    /** 全屏白闪，用于失球、通关这类强反馈 */
    flash: function (strength) {
      var el = getFlash();
      if (!el) return;
      flashDur = 260;
      flashStart = now();
      el.style.opacity = String((strength || 0.42) * 0.5);
      if (!flashId) flashId = requestAnimationFrame(flashTick);
    }
  };

  window.FX = FX;
})();
