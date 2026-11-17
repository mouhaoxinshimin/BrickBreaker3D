/* ==========================================================
   打砖块 · 音效与震动
   全部用 Web Audio 现场合成，不依赖任何音频文件。
   对外暴露 window.SND 与 window.HAPTIC。
   作者：某好心市民
   ========================================================== */

(function () {
  'use strict';

  /* ---------------- 音效 ---------------- */

  var SND = {
    ctx: null,
    enabled: true,
    unlocked: false,

    /** 首次用户手势时调用（浏览器要求） */
    init: function () {
      if (!this.ctx) {
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          this.ctx = new AC();
        } catch (e) {
          return false;
        }
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.unlocked = true;
      return true;
    },

    /** 基础音：波形 / 频率 / 时长 / 音量 / 频率回落比例 */
    blip: function (freq, dur, type, gain, fallRatio) {
      if (!this.enabled || !this.ctx) return;
      dur = dur || 0.08;
      type = type || 'square';
      gain = (gain === undefined) ? 0.18 : gain;
      fallRatio = (fallRatio === undefined) ? 0.92 : fallRatio;

      var t = this.ctx.currentTime;
      var osc = this.ctx.createOscillator();
      var g = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * fallRatio), t + dur);

      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    /** 砖块被击碎：行越高音越高 */
    brick: function (row) {
      var scale = [523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319];
      var f = scale[Math.min(row || 0, scale.length - 1)];
      this.blip(f, 0.09, 'square', 0.16);
    },

    /** 砖块只是受伤（没碎） */
    hit: function () {
      this.blip(392, 0.05, 'square', 0.11, 0.88);
    },

    /** 挡板接球：低沉短促 */
    paddle: function () {
      this.blip(196, 0.06, 'triangle', 0.22, 0.96);
    },

    /** 撞墙：很轻的一声 */
    wall: function () {
      this.blip(330, 0.035, 'sine', 0.09, 0.95);
    },

    /** 发射 */
    launch: function () {
      this.blip(660, 0.1, 'triangle', 0.2, 1.25);
    },

    /** 连击音，音高随连击数递增 */
    combo: function (n) {
      this.blip(400 + Math.min(n, 20) * 70, 0.07, 'square', 0.17);
    },

    /** 掉球：一段下滑锯齿 */
    lose: function () {
      if (!this.enabled || !this.ctx) return;
      var t = this.ctx.currentTime;
      var osc = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.5);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.52);
    },

    /** 过一关 / 通关：上行琶音 */
    win: function () {
      var self = this;
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        setTimeout(function () { self.blip(f, 0.14, 'triangle', 0.2, 1.0); }, i * 85);
      });
    },

    /** 破个人最好成绩：一个小上滑点缀 */
    record: function () {
      var self = this;
      [784, 988, 1319].forEach(function (f, i) {
        setTimeout(function () { self.blip(f, 0.11, 'sine', 0.2, 1.0); }, i * 70);
      });
    },

    /** 界面点击 */
    tap: function () {
      this.blip(540, 0.04, 'sine', 0.1, 1.0);
    }
  };

  /* ---------------- 震动 ---------------- */

  var HAPTIC = {
    enabled: true,
    supported: !!(navigator.vibrate),

    buzz: function (pattern) {
      if (!this.enabled || !this.supported) return;
      try { navigator.vibrate(pattern); } catch (e) { /* 忽略 */ }
    },
    light: function () { this.buzz(12); },
    medium: function () { this.buzz(26); },
    heavy: function () { this.buzz([36, 26, 36]); },
    lose: function () { this.buzz([70, 45, 70, 45, 110]); }
  };

  window.SND = SND;
  window.HAPTIC = HAPTIC;
})();
