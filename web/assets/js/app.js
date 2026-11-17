/* ==========================================================
   打砖块 · 界面与交互
   负责：难度/球速选择、排行榜、横竖屏切换、开关、输入。
   作者：某好心市民
   ========================================================== */

(function () {
  'use strict';

  // 统一入口：允许传 '#app' 或 'app'
  var $ = function (id) {
    if (!id) return null;
    return document.getElementById(String(id).replace(/^#/, ''));
  };

  var settings = {
    sound: true,
    vibrate: true,
    shake: false,
    diff: 'normal',
    speed: 'std',
    playerName: '某好心市民'
  };

  var orientation = 'landscape';
  var isDesktopShell = !!(window.chrome && window.chrome.webview);

  /* ---------------- 本地设置持久化 ---------------- */

  function loadSettings() {
    try {
      var raw = localStorage.getItem('nb_settings');
      if (raw) {
        var s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          if (typeof s.sound === 'boolean') settings.sound = s.sound;
          if (typeof s.vibrate === 'boolean') settings.vibrate = s.vibrate;
          if (typeof s.shake === 'boolean') settings.shake = s.shake;
          if (s.diff && window.GAME.DIFFS[s.diff]) settings.diff = s.diff;
          if (s.speed && window.GAME.SPEEDS[s.speed]) settings.speed = s.speed;
        }
      }
      var name = window.SCORES.loadName();
      if (name) settings.playerName = name;
    } catch (e) { /* 忽略 */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem('nb_settings', JSON.stringify({
        sound: settings.sound,
        vibrate: settings.vibrate,
        shake: settings.shake,
        diff: settings.diff,
        speed: settings.speed
      }));
    } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 应用设置到引擎 ---------------- */

  function applyToggles() {
    if (window.SND) window.SND.enabled = settings.sound;
    if (window.HAPTIC) window.HAPTIC.enabled = settings.vibrate;
    if (window.FX) window.FX.shakeEnabled = settings.shake;

    $('#tgSound').classList.toggle('on', settings.sound);
    $('#tgVibrate').classList.toggle('on', settings.vibrate);
    $('#tgShake').classList.toggle('on', settings.shake);
  }

  /* ---------------- 难度 / 球速 ---------------- */

  function buildSeg(host, items, current, onPick) {
    host.innerHTML = '';
    Object.keys(items).forEach(function (key) {
      var it = items[key];
      var b = document.createElement('button');
      b.className = 'segBtn' + (key === current ? ' active' : '');
      b.textContent = it.name;
      b.setAttribute('data-key', key);
      b.onclick = function () {
        if (window.SND) { window.SND.init(); window.SND.tap(); }
        Array.prototype.forEach.call(host.children, function (c) {
          c.classList.toggle('active', c === b);
        });
        onPick(key);
      };
      host.appendChild(b);
    });
  }

  /** 把「难度 + 球速」换算成一眼能对比的数值：行 × 列、砖块数、命、最硬血量、球速倍数
   *  竖屏是 5 列多几行，数值跟着变，所以切方向后要重新刷一次 */
  function renderPickDesc() {
    var stat = $('diffStat');
    var desc = $('diffDesc');
    if (!stat || !desc) return;
    var d = window.GAME.DIFFS[settings.diff];
    var s = window.GAME.SPEEDS[settings.speed];
    var portrait = document.body.classList.contains('portrait');
    var rows = Math.min(d.rows + (portrait ? 3 : 0), 9);
    var cols = portrait ? 5 : Math.min(d.cols, 11);
    stat.textContent = rows + ' 行 × ' + cols + ' 列 · ' + (rows * cols) + ' 块砖 · ' +
      d.lives + ' 条命 · 最硬 ' + d.maxHp + ' 血 · 球速 ×' + s.mul.toFixed(2);
    desc.textContent = d.desc;
  }

  function renderPickers() {
    buildSeg($('diffSeg'), window.GAME.DIFFS, settings.diff, function (k) {
      settings.diff = k;
      renderPickDesc();
      saveSettings();
    });

    buildSeg($('speedSeg'), window.GAME.SPEEDS, settings.speed, function (k) {
      settings.speed = k;
      renderPickDesc();
      saveSettings();
    });

    renderPickDesc();
  }

  /* ---------------- 排行榜 ---------------- */

  function diffName(key) {
    var d = window.GAME.DIFFS[key];
    return d ? d.name : key;
  }

  function renderBoard() {
    var list = window.SCORES.list();
    var host = $('boardList');
    host.innerHTML = '';

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'boardEmpty';
      empty.textContent = '还没有记录 · 去打一局吧';
      host.appendChild(empty);
      return;
    }

    list.forEach(function (e, i) {
      var row = document.createElement('div');
      row.className = 'boardRow' + (i < 3 ? ' top' : '');

      var rank = document.createElement('div');
      rank.className = 'boardRank';
      rank.textContent = (i + 1);

      var name = document.createElement('div');
      name.className = 'boardName';
      var nameText = document.createElement('span');
      nameText.textContent = e.name || window.SCORES.DEFAULT_NAME;
      name.appendChild(nameText);

      var badge = document.createElement('span');
      badge.className = 'boardBadge';
      badge.textContent = diffName(e.diff) + ' · ' + window.GAME.SPEEDS[e.speed || 'std'].name;
      name.appendChild(badge);

      var score = document.createElement('div');
      score.className = 'boardScore';
      score.textContent = e.score;

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      host.appendChild(row);
    });
  }

  function openBoard() {
    renderBoard();
    $('#board').classList.remove('hidden');
    $('#boardMask') && $('#boardMask');
  }

  function closeBoard() {
    $('#board').classList.add('hidden');
    // 返回时把名字带回输入框
    $('#nameInput').value = settings.playerName;
  }

  /* ---------------- 覆盖层 ---------------- */

  function hideOverlay() {
    $('#overlay').classList.add('hidden');
  }

  function showTip(title, lose, sub, recordRank) {
    var ov = $('#overlay');
    var h = $('#ovTitle');
    var desc = $('#ovDesc');
    var sc = $('#ovScore');
    var btn = $('#startBtn');

    h.textContent = title;
    h.className = lose ? 'lose' : '';
    desc.style.display = 'none';
    sc.style.display = 'block';
    sc.textContent = sub;

    if (recordRank > 0) {
      var rk = $('#ovRank');
      rk.style.display = 'block';
      rk.textContent = recordRank === 1
        ? '新纪录！第 1 名'
        : '进入排行榜 · 第 ' + recordRank + ' 名';
      if (window.SND && recordRank === 1) window.SND.record();
    } else {
      $('#ovRank').style.display = 'none';
    }

    btn.textContent = '再来一局';
    ov.classList.remove('hidden');
  }

  function resetOverlay() {
    $('#ovTitle').textContent = '打砖块';
    $('#ovTitle').className = '';
    $('#ovDesc').style.display = 'block';
    $('#ovScore').style.display = 'none';
    $('#ovRank').style.display = 'none';
    $('#startBtn').textContent = '开始游戏';
  }

  /* ---------------- 横竖屏 ---------------- */

  function applyOrientation(mode, notifyShell) {
    orientation = mode;
    document.body.classList.toggle('portrait', mode === 'portrait');

    if (window.GAME.setOrientation) window.GAME.setOrientation(mode);

    var btn = $('#tgOrient');
    // 按钮里现在是图标 + 文字两个节点，只换文字那个，别把 svg 图标一起清了
    var btnTxt = $('tgOrientText');
    if (btnTxt) btnTxt.textContent = mode === 'portrait' ? '竖屏' : '横屏';
    btn.setAttribute('title', mode === 'portrait' ? '当前竖屏 · 点击切换横屏' : '当前横屏 · 点击切换竖屏');

    // PC 外壳：WebView 内 resizeTo 无效，需要外壳把窗口尺寸也改掉
    if (notifyShell && isDesktopShell) {
      var w = mode === 'portrait' ? 480 : 980;
      var h = mode === 'portrait' ? 820 : 640;
      try {
        window.chrome.webview.postMessage('resize:' + w + 'x' + h);
      } catch (e) { /* 外壳没接这个通道就算了，页面自己也能适配 */ }
    }

    // 竖屏砖块是 5 列多行，菜单上的数值要跟着重算
    renderPickDesc();

    // 切完方向后重新算一遍相机
    setTimeout(function () {
      if (window.GAME.fit) window.GAME.fit();
    }, 60);
  }

  /* ---------------- 开局 ---------------- */

  function startRound() {
    if (window.SND) window.SND.init();

    // 如果输入框里有名字就记住
    var name = $('#nameInput').value.trim();
    if (name) {
      settings.playerName = name.slice(0, 12);
      window.SCORES.saveName(settings.playerName);
    }

    hideOverlay();
    $('#board').classList.add('hidden');
    window.GAME.start(settings.diff, settings.speed);
    updateHUD(0, window.SCORES.best(), 1);
  }

  /* ---------------- HUD ---------------- */

  var lastScore = -1;

  function updateHUD(score, best, level) {
    lastScore = score;
    $('#score').textContent = score;
    $('#best').textContent = best;
    // 关卡行顺带标出本局难度与球速倍率，打着打着也忘不掉自己在什么档位
    var d = window.GAME.state.diff;
    var s = window.GAME.state.speed;
    $('#levelTag').textContent = '第 ' + level + ' / ' + window.GAME.LEVEL_MAX + ' 关 · ' +
      d.name + ' · 球速 ×' + s.mul.toFixed(2);

    // 生命圆点
    var lives = window.GAME.state.lives;
    var host = $('#lives');
    var total = window.GAME.state.diff.lives;
    if (host.childElementCount !== total) {
      host.innerHTML = '';
      for (var i = 0; i < total; i++) {
        var dot = document.createElement('span');
        dot.className = 'life';
        host.appendChild(dot);
      }
    }
    Array.prototype.forEach.call(host.children, function (c, i) {
      c.classList.toggle('off', i >= lives);
    });
  }

  /* ---------------- 输入绑定 ---------------- */

  function bindInput() {
    var app = $('#app');

    // 鼠标
    app.addEventListener('mousemove', function (e) {
      window.GAME.moveTo(e.clientX);
    });

    app.addEventListener('mousedown', function (e) {
      if (window.GAME.state.playing) {
        window.GAME.launch();
      }
    });

    // 触摸：移动挡板 + 点击发射。滑动时不误判为点击
    var touchStartX = 0, touchStartT = 0, touchMoved = false;

    app.addEventListener('touchstart', function (e) {
      if (!e.touches.length) return;
      e.preventDefault();
      touchStartX = e.touches[0].clientX;
      touchStartT = Date.now();
      touchMoved = false;
      window.GAME.moveTo(e.touches[0].clientX);
    }, { passive: false });

    app.addEventListener('touchmove', function (e) {
      if (!e.touches.length) return;
      e.preventDefault();
      var dx = Math.abs(e.touches[0].clientX - touchStartX);
      if (dx > 12) touchMoved = true;
      window.GAME.moveTo(e.touches[0].clientX);
    }, { passive: false });

    app.addEventListener('touchend', function (e) {
      if (touchMoved) return;
      if (Date.now() - touchStartT < 320 && window.GAME.state.playing) {
        window.GAME.launch();
      }
    }, { passive: false });

    // 键盘
    window.addEventListener('keydown', function (e) {
      if (e.code === 'ArrowLeft') { e.preventDefault(); window.GAME.nudge(-1); }
      if (e.code === 'ArrowRight') { e.preventDefault(); window.GAME.nudge(1); }
      if (e.code === 'Space') {
        e.preventDefault();
        if (window.GAME.state.playing) window.GAME.launch();
      }
    });

    // 切到后台自动暂停，回来时清掉时间差避免球瞬移
    document.addEventListener('visibilitychange', function () {
      if (!window.GAME.setPaused) return;
      if (document.hidden) {
        window.GAME.setPaused(true);
      } else {
        window.GAME.setPaused(false);
      }
    });
  }

  /* ---------------- 按钮绑定 ---------------- */

  function bindButtons() {
    $('#startBtn').onclick = startRound;

    $('#tgSound').onclick = function () {
      settings.sound = !settings.sound;
      if (window.SND) { window.SND.init(); window.SND.tap(); }
      applyToggles();
      saveSettings();
    };

    $('#tgVibrate').onclick = function () {
      settings.vibrate = !settings.vibrate;
      if (window.HAPTIC && settings.vibrate) window.HAPTIC.light();
      applyToggles();
      saveSettings();
    };

    $('#tgShake').onclick = function () {
      settings.shake = !settings.shake;
      applyToggles();
      if (settings.shake && window.FX) window.FX.shake(5);
      saveSettings();
    };

    $('#tgOrient').onclick = function () {
      if (window.SND) { window.SND.init(); window.SND.tap(); }
      applyOrientation(orientation === 'portrait' ? 'landscape' : 'portrait', true);
    };

    $('#tgBoard').onclick = function () {
      if (window.SND) { window.SND.init(); window.SND.tap(); }
      openBoard();
    };

    $('#boardClose').onclick = function () {
      if (window.SND) window.SND.tap();
      closeBoard();
    };

    $('#nameInput').addEventListener('change', function () {
      var v = this.value.trim();
      if (v) {
        settings.playerName = v.slice(0, 12);
        window.SCORES.saveName(settings.playerName);
      }
    });
  }

  /* ---------------- 引擎回调 ---------------- */

  function bindGame() {
    window.GAME.onScore(function (s, best) {
      updateHUD(s, best, window.GAME.state.level);
    });

    window.GAME.onLevelUp(function (lv) {
      updateHUD(window.GAME.state.score, window.GAME.state.best, lv);
    });

    window.GAME.onFinish(function (result) {
      var name = $('#nameInput').value.trim() || settings.playerName;
      var rank = 0;
      try {
        rank = window.SCORES.add({
          name: name,
          score: result.score,
          level: result.level,
          diff: result.diff,
          speed: result.speed
        });
      } catch (e) { rank = 0; }

      updateHUD(result.score, window.SCORES.best(), result.level);

      var title = result.won ? '🏆 通关!' : 'GAME OVER';
      var sub = result.won
        ? '全 ' + window.GAME.LEVEL_MAX + ' 关清除 · 最终得分 ' + result.score
        : '得分 ' + result.score + ' · 到达第 ' + result.level + ' 关';

      showTip(title, !result.won, sub, rank);
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    if (!window.THREE) {
      document.body.innerHTML =
        '<div style="color:#ff5e7a;font-size:14px;padding:40px;text-align:center;line-height:1.8">' +
        'Three.js 没加载成功。<br>请确认 assets/vendor/three.min.js 存在。' +
        '</div>';
      return;
    }

    loadSettings();

    window.GAME.init($('#app'));

    // 顺序要紧：先挂引擎回调，再绑 UI
    bindGame();
    bindButtons();
    bindInput();

    renderPickers();
    applyToggles();

    $('#nameInput').value = window.SCORES.loadName();
    $('#best').textContent = window.SCORES.best();

    // 按当前窗口宽高比决定初始方向
    applyOrientation(window.innerWidth > window.innerHeight ? 'landscape' : 'portrait', false);

    // 提示条 6 秒后淡出
    setTimeout(function () {
      var h = $('#hint');
      if (h) h.style.opacity = '0';
    }, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
