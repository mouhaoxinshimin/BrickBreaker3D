/* ==========================================================
   打砖块 · 排行榜
   存在 localStorage，按分数降序，同分时关卡高的靠前。
   对外暴露 window.SCORES。
   作者：某好心市民
   ========================================================== */

(function () {
  'use strict';

  var KEY = 'nb_scores';
  var KEY_BEST = 'nb_best';      // 兼容原型时期存的老最高分
  var KEY_NAME = 'nb_player';    // 上次用的名字
  var MAX = 10;
  var DEFAULT_NAME = '某好心市民';

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (e) {
        return e && typeof e.score === 'number' && isFinite(e.score);
      });
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    } catch (e) { /* 配额满了也不影响玩 */ }
  }

  function sortDesc(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.level || 0) !== (a.level || 0)) return (b.level || 0) - (a.level || 0);
    return (a.time || 0) - (b.time || 0);
  }

  var SCORES = {

    /** 全部记录（已排序、已截断） */
    list: function () {
      return read().sort(sortDesc).slice(0, MAX);
    },

    /** 历史最高分（兼容老的单一最高分记录） */
    best: function () {
      var list = read();
      var top = list.length ? list.sort(sortDesc)[0].score : 0;
      var legacy = 0;
      try {
        legacy = parseInt(localStorage.getItem(KEY_BEST) || '0', 10) || 0;
      } catch (e) { legacy = 0; }
      return Math.max(top, legacy);
    },

    /**
     * 记录一局，返回它在榜上的名次（0 表示没进榜）。
     * entry: { name, score, level, diff, speed }
     */
    add: function (entry) {
      if (!entry || !isFinite(entry.score) || entry.score <= 0) return 0;

      var list = read();
      var item = {
        name: (entry.name || DEFAULT_NAME).slice(0, 12),
        score: Math.round(entry.score),
        level: entry.level || 1,
        diff: entry.diff || 'normal',
        speed: entry.speed || 'std',
        time: Date.now()
      };
      list.push(item);
      list.sort(sortDesc);

      var capped = list.slice(0, MAX);
      write(capped);

      // 老 key 同步一份，保持「最高分」显示不跳变
      try {
        var best = capped.length ? capped[0].score : item.score;
        if (best > (parseInt(localStorage.getItem(KEY_BEST) || '0', 10) || 0)) {
          localStorage.setItem(KEY_BEST, String(best));
        }
      } catch (e) { /* 忽略 */ }

      for (var i = 0; i < capped.length; i++) {
        if (capped[i].time === item.time && capped[i].score === item.score) {
          return i + 1;   // 1-based
        }
      }
      return 0;
    },

    /** 记住玩家名字 */
    saveName: function (n) {
      try { localStorage.setItem(KEY_NAME, (n || '').slice(0, 12)); } catch (e) { /* 忽略 */ }
    },

    loadName: function () {
      try {
        var n = localStorage.getItem(KEY_NAME);
        return (n && n.trim()) ? n.trim().slice(0, 12) : DEFAULT_NAME;
      } catch (e) {
        return DEFAULT_NAME;
      }
    },

    clear: function () {
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(KEY_BEST);
      } catch (e) { /* 忽略 */ }
    },

    DEFAULT_NAME: DEFAULT_NAME
  };

  window.SCORES = SCORES;
})();
