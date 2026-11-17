/* ==========================================================
   打砖块 · 核心（Three.js 场景 / 关卡 / 物理 / 粒子）
   对外暴露 window.GAME。
   所有可调参数集中在 DIFFS 与 SPEEDS 里。
   作者：某好心市民
   ========================================================== */

(function () {
  'use strict';

  /* ---------------- 参数表 ---------------- */

  // 难度：影响砖块布局、血量、生命数、球速基数
  var DIFFS = {
    easy: {
      key: 'easy', name: '简单', short: 'EASY',
      lives: 5, baseSpeed: 0.34,
      rows: 4, cols: 7, maxHp: 1, holeRate: 0.00, scoreMul: 1.0,
      desc: '5 条命 · 单层薄砖 · 球慢，先熟悉节奏'
    },
    normal: {
      key: 'normal', name: '普通', short: 'NORMAL',
      lives: 3, baseSpeed: 0.42,
      rows: 5, cols: 8, maxHp: 2, holeRate: 0.05, scoreMul: 1.2,
      desc: '3 条命 · 双层砖 · 标准球速'
    },
    hard: {
      key: 'hard', name: '困难', short: 'HARD',
      lives: 2, baseSpeed: 0.50,
      rows: 6, cols: 9, maxHp: 3, holeRate: 0.10, scoreMul: 1.6,
      desc: '2 条命 · 三层砖 · 球更快，砖墙带缺口'
    },
    hell: {
      key: 'hell', name: '地狱', short: 'HELL',
      lives: 1, baseSpeed: 0.58,
      rows: 7, cols: 10, maxHp: 4, holeRate: 0.16, scoreMul: 2.2,
      desc: '1 条命 · 四层砖 · 球极快，缺口最多'
    }
  };

  // 球速档位：在难度基数上再乘一次。档与档之间要拉得开，否则玩家切了没感觉
  var SPEEDS = {
    slow: { key: 'slow', name: '慢', mul: 0.72 },
    std:  { key: 'std',  name: '标准', mul: 1.00 },
    fast: { key: 'fast', name: '快', mul: 1.40 }
  };

  // 场地：横屏偏宽（接近 16:10），竖屏偏长（接近 9:16），
  // 这样在常见屏幕上摄像头不用退太远，画面能撑满
  var FIELD = {
    landscape: { W: 20, H: 13 },
    portrait:  { W: 11, H: 18 }
  };

  var LEVEL_MAX = 6;          // 一共 6 关
  var BALL_R = 0.45;
  var PADDLE_W = 4.0;

  /* ---------------- 运行时状态 ---------------- */

  var scene, camera, renderer, clock;
  var paddle = null;
  var ballMesh = null;
  var bricks = [];
  var particles = [];
  var backdrop = null;

  var W = FIELD.landscape.W;
  var H = FIELD.landscape.H;
  var orientation = 'landscape';

  var targetX = 0;
  var vel = { x: 0, y: 0 };
  var frameId = 0;
  var lastTime = 0;

  var state = {
    score: 0,
    lives: 3,
    level: 1,
    best: 0,
    playing: false,
    launched: false,
    combo: 0,
    comboTimer: 0,
    paused: false,
    diff: DIFFS.normal,
    speed: SPEEDS.std,
    ballSpeed: 0,
    over: false
  };

  /* ---------------- 工具 ---------------- */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // 固定步长换算：把真实经过的毫秒换算成"60fps 下了几帧"，
  // 卡顿时限制上限，避免球直接穿墙
  function frameScale(dtMs) {
    if (!dtMs || dtMs <= 0) return 1;
    var f = dtMs / 16.667;
    if (f > 3.2) f = 3.2;
    return f;
  }

  /* ---------------- 场景初始化 ---------------- */

  function initScene(canvasHost) {
    scene = new THREE.Scene();
    // 不用黑背景和浓雾：canvas 透明，直接露出 CSS 的淡蓝→粉→奶油渐变
    scene.background = null;

    // 正交相机：没有透视，砖块远近一样大，画面是纯平面而不是斜着看的
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 260);
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '1';
    canvasHost.appendChild(renderer.domElement);

    // 平面贴图材质不吃光，场景里不再放任何灯光

    rebuildBackdrop();
    clock = new THREE.Clock();
  }

  /** 背景重建：去掉原来那圈 1px 灰线（浅底上细线显灰很脏），
   *  换成一块奶油白圆角底板 + 暖投影，跟按钮同一套语言，场地也更有容器感 */
  function rebuildBackdrop() {
    if (backdrop) { scene.remove(backdrop); backdrop = null; }

    var pw = W + 1.6;
    var ph = H + 1.6;
    var rad = 1.1;

    var g = new THREE.Group();
    var sh = rectMesh(pw, ph, rad, 0xEADFD2, -0.56);      // 底板投影
    sh.position.x = 0.22;
    sh.position.y = -0.22;
    g.add(sh);
    g.add(rectMesh(pw, ph, rad, 0xFFFCF6, -0.52));         // 底板本体

    scene.add(g);
    backdrop = g;
  }

  /**
   * 相机随视口与站点尺寸自适应，保证整个场地完整可见。
   * 垂直 fov 固定，靠后退距离同时满足高度和宽度需求。
   */
  function fitCamera() {
    var aspect = window.innerWidth / window.innerHeight;

    // 正交视景体：场地永远正对着相机铺满，没有透视也不会歪成梯形
    // 竖屏底部压着操作按钮，所以竖向多留一点，别让挡板钻到按钮下面
    var needH = H * (orientation === 'portrait' ? 1.40 : 1.06);
    var needW = W * 1.02;

    var viewH = Math.max(needH, needW / aspect);
    var viewW = viewH * aspect;

    camera.left = -viewW / 2;
    camera.right = viewW / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.position.set(0, 0, 50);
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ---------------- 矢量形状工厂 ----------------
     网页按钮是 CSS 矢量描边，边缘永远硬；canvas 贴图是位图，
     缩放靠插值，描边就被摊糊。所以砖块 / 挡板 / 球全部改成
     THREE.Shape 真几何：投影、描边、填充各叠一层，
     跟 CSS 的 box-shadow + border 一个思路，任意缩放都锐利。 */

  /** 圆角矩形 Shape */
  function roundedShape(w, h, r) {
    var rr = Math.min(r, Math.min(w, h) / 2);
    var s = new THREE.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + rr, y);
    s.lineTo(x + w - rr, y);
    s.quadraticCurveTo(x + w, y, x + w, y + rr);
    s.lineTo(x + w, y + h - rr);
    s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    s.lineTo(x + rr, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - rr);
    s.lineTo(x, y + rr);
    s.quadraticCurveTo(x, y, x + rr, y);
    s.curveSegments = 12;
    return s;
  }

  function rectMesh(w, h, r, color, z) {
    var geo = new THREE.ShapeGeometry(roundedShape(w, h, r));
    var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color }));
    m.position.z = z || 0;
    return m;
  }

  /** 描边色：统一暖橙，替掉原来的深棕黑框
   *  砖块填充本身是浅马卡龙，配深棕边就压出黑框、显得脏；
   *  暖橙边在浅黄浅粉浅蓝上都能立住轮廓，整片也不出黑 */
  var EDGE_WARM = 0xE8913C;
  function edgeOf() { return EDGE_WARM; }

  /** 卡片：投影 + 描边 + 填充，三层矢量叠出 CSS 那种硬边
   *  参数直接照抄底部按钮（--toggle）：border 3px / radius 16px / shadow 3px
   *  pill=true 时按高度做胶囊（挡板用），否则走砖块那套圆润小角 */
  function cardMesh(w, h, fill, pill) {
    var g = new THREE.Group();
    var lw = Math.min(w, h) * 0.07;                        // 描边宽，约等于按钮的 3px
    var radius = pill ? Math.min(h / 2, w * 0.22) : Math.min(w, h) * 0.22;
    var off = lw * 1.75;                                   // 投影偏移，太小吃不着只能看到一条边

    var sh = rectMesh(w, h, radius, 0xD8C4B2, -0.05);       // 暖灰褐，跟按钮的 --shadow2 一致
    sh.position.x = off;
    sh.position.y = -off;
    g.add(sh);

    g.add(rectMesh(w, h, radius, edgeOf(fill), -0.02));

    var fm = rectMesh(w - lw * 2, h - lw * 2, Math.max(0.35, radius - lw), fill, 0);
    g.add(fm);
    g.userData.fillMat = fm.material;
    return g;
  }

  function makePaddle() {
    // 蓝色圆角胶囊，和 2048 的按钮同一套描边投影
    var m = cardMesh(PADDLE_W, 1.15, 0x5FA8F0, true);
    m.position.set(0, -H / 2 + 2.2, 0);
    scene.add(m);
    return m;
  }

  function makeBall(x, y) {
    var r = BALL_R;
    var lw = r * 0.17;
    var off = r * 0.11;
    var SEG = 40;
    var g = new THREE.Group();

    var sh = new THREE.Mesh(new THREE.CircleGeometry(r, SEG), new THREE.MeshBasicMaterial({ color: 0xF2DCCB }));
    sh.position.set(off, -off, -0.06);
    g.add(sh);

    // 边用暖橙而不是深棕，黄球配橙边才有卡通糖果感
    var ed = new THREE.Mesh(new THREE.CircleGeometry(r, SEG), new THREE.MeshBasicMaterial({ color: 0xE8913C }));
    ed.position.z = -0.03;
    g.add(ed);

    var bd = new THREE.Mesh(new THREE.CircleGeometry(r - lw, SEG), new THREE.MeshBasicMaterial({ color: 0xFFE066 }));
    bd.position.z = 0;
    g.add(bd);

    // 左上高光，卡通球体的点睛
    var hi = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.26, 24),
      new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.78 })
    );
    hi.position.set(-r * 0.30, r * 0.34, 0.02);
    g.add(hi);

    g.userData.fillMat = bd.material;
    g.position.set(x, y, 1);
    scene.add(g);
    return { mesh: g, halo: null };
  }

  /* ---------------- 砖块 ---------------- */

  // 马卡龙色板，与 2048 / 猜拳对决同一套
  // 砖块配色：比按钮的黄再淡一档，铺满一屏才不会像一墙糖果
  var palette = [0xFFB6D2, 0xFFC98F, 0xFFE879, 0xA9D8FF, 0xA5E6BC, 0xCFBEFF];

  function clearBricks() {
    for (var i = 0; i < bricks.length; i++) {
      if (bricks[i].mesh) scene.remove(bricks[i].mesh);
    }
    bricks = [];
  }

  function buildLevel(level, layout) {
    clearBricks();

    var d = state.diff;
    var rows, cols;
    // 行列数永远按当前方向算：竖屏少列多层（砖块横着砌），横屏多列少层
    var baseRows = d.rows + Math.floor((level - 1) / 2);
    rows = Math.min(baseRows + (orientation === 'portrait' ? 3 : 0), 9);
    cols = orientation === 'portrait' ? 5 : Math.min(d.cols + Math.floor((level - 1) / 3), 11);
    state.rows = rows;
    state.cols = cols;

    // 横屏宽、竖屏窄，砖块自动换比例，保证铺满
    var usableW = W - 1.6;
    var bw = usableW / cols;
    // 砖块区高度预算；除以 rows*1.2 把行间距一起算进去，不然实际会溢出压到挡板
    var budget = H * (orientation === 'portrait' ? 0.68 : 0.58);
    var bh = Math.min(2.2, budget / (rows * 1.2));
    var gap = Math.min(bw, bh) * 0.16;

    // 顶部要给 HUD（分数 / 关卡行 / 生命）留出安全距离，否则宽屏下砖块首行会压住关卡文字。
    // 同时又不能压太低，砖块底边与挡板之间必须留出球直径以上的反弹空间。
    var topPad = orientation === 'portrait' ? 2.1 : 1.55;
    var topY = H / 2 - topPad;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var hp, maxHp, color, alive;

        if (layout) {
          // 换方向时行列数变了，按比例把源网格的格子映射到新网格上，
          // 已打碎的格子照样空缺，剩余血量与配色一并沿过来
          var r1 = Math.min(layout.rows - 1, Math.floor((r + 0.5) / rows * layout.rows));
          var c1 = Math.min(layout.cols - 1, Math.floor((c + 0.5) / cols * layout.cols));
          var cell = layout.cells[r1 + ':' + c1];
          if (!cell || !cell.alive) continue;
          hp = cell.hp;
          maxHp = cell.maxHp;
          color = cell.color;
          alive = true;
        } else {
          // 关卡越高、难度越高，缺口越多
          var holeRate = d.holeRate + (level - 1) * 0.02;
          if (level > 1 && Math.random() < holeRate) continue;

          // 上部行更硬：1 ~ maxHp 之间按行分配
          hp = 1 + Math.floor((r / Math.max(1, rows - 1)) * (d.maxHp - 1));
          // 关卡加成：每过两关全线 +1 血
          hp += Math.floor((level - 1) / 2);
          if (hp > 5) hp = 5;
          maxHp = hp;
          // 配色不按行走，每块随机抓一个，整片才够热闹
          color = palette[Math.floor(Math.random() * palette.length)];
          alive = true;
        }

        // 平面卡通砖块：矢量几何，跟网页按钮一样靠真描边撑硬边
        var bwVis = bw - gap;
        var bhVis = bh - gap;

        var mesh = cardMesh(bwVis, bhVis, color);
        mesh.position.set(
          -W / 2 + 0.8 + bw * (c + 0.5),
          topY - r * (bh + gap * 1.6),
          0
        );

        if (hp < maxHp) {
          // 受过伤的砖块压暗，和原版「打到半血变灰」一致
          mesh.userData.fillMat.color.multiplyScalar(0.72 + Math.min(hp, 4) * 0.07);
        }

        scene.add(mesh);
        bricks.push({
          mesh: mesh, hp: hp, maxHp: maxHp, color: color, row: r, col: c, alive: alive,
          w: bwVis, h: bhVis
        });
      }
    }
  }

  // 把当前关卡的剩余状态抓成快照，用于切换横竖屏后原样重排
  function captureLayout() {
    var cells = {};
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      cells[b.row + ':' + b.col] = {
        hp: b.hp, maxHp: b.maxHp, color: b.color, alive: true
      };
    }
    return { rows: state.rows, cols: state.cols, cells: cells };
  }

  /* ---------------- 粒子 ---------------- */

  function spawnBurst(x, y, color) {
    var n = 16;
    for (var i = 0; i < n; i++) {
      var size = 0.14 + Math.random() * 0.16;
      var geo = new THREE.BoxGeometry(size, size, size);
      var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });
      var p = new THREE.Mesh(geo, mat);
      p.position.set(x, y, 0);

      var a = Math.random() * Math.PI * 2;
      var sp = 0.11 + Math.random() * 0.26;
      p.userData.vx = Math.cos(a) * sp;
      p.userData.vy = Math.sin(a) * sp;
      p.userData.life = 1;
      p.userData.decay = 0.026 + Math.random() * 0.016;

      scene.add(p);
      particles.push(p);
    }
  }

  function updateParticles(fs) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.position.x += p.userData.vx * fs;
      p.position.y += p.userData.vy * fs;
      p.userData.vy -= 0.011 * fs;
      p.userData.life -= p.userData.decay * fs;
      p.rotation.x += 0.11 * fs;
      p.rotation.y += 0.13 * fs;
      p.material.opacity = p.userData.life < 0 ? 0 : p.userData.life;
      p.scale.setScalar(Math.max(0.08, p.userData.life));

      if (p.userData.life <= 0) {
        scene.remove(p);
        particles.splice(i, 1);
      }
    }
  }

  /* ---------------- 球的重置与发射 ---------------- */

  function clearBalls() {
    if (ballMesh) { scene.remove(ballMesh); ballMesh = null; }
  }

  function resetBall() {
    clearBalls();
    state.launched = false;
    var b = makeBall(paddle ? paddle.position.x : 0, paddle ? paddle.position.y + 1.4 : -H / 2 + 3);
    ballMesh = b.mesh;
    vel = { x: 0, y: 0 };
  }

  function currentBallSpeed() {
    var d = state.diff;
    var s = state.speed;
    // 每过一关再小幅提速
    var lvBoost = 1 + (state.level - 1) * 0.05;
    return d.baseSpeed * s.mul * lvBoost;
  }

  function launchBall() {
    if (!state.playing || state.paused || state.over) return;
    if (state.launched) return;

    state.launched = true;
    var sp = currentBallSpeed();
    // 出发角度限制在偏上方的窄扇形内，避免一上来就贴边飞
    var ang = (Math.random() * 0.5 - 0.25) + Math.PI / 2;
    vel = { x: Math.cos(ang) * sp, y: Math.abs(Math.sin(ang)) * sp };

    if (window.SND) { window.SND.init(); window.SND.launch(); }
  }

  /* ---------------- 局与关 ---------------- */

  function startGame(diffKey, speedKey) {
    state.diff = DIFFS[diffKey] || DIFFS.normal;
    state.speed = SPEEDS[speedKey] || SPEEDS.std;

    state.score = 0;
    state.level = 1;
    state.lives = state.diff.lives;
    state.combo = 0;
    state.comboTimer = 0;
    state.over = false;
    state.paused = false;
    state.playing = true;
    state.best = window.SCORES ? window.SCORES.best() : 0;

    if (!paddle) paddle = makePaddle();
    targetX = 0;
    paddle.position.x = 0;

    buildLevel(state.level);
    resetBall();
    fitCamera();
  }

  function nextLevel() {
    state.level++;
    if (state.level > LEVEL_MAX) {
      finish(true);
      return;
    }
    buildLevel(state.level);
    resetBall();
    if (window.SND) window.SND.win();
    if (window.HAPTIC) window.HAPTIC.medium();
    if (typeof onLevelUp === 'function') onLevelUp(state.level);
  }

  function loseLife() {
    state.lives--;
    if (window.SND) window.SND.lose();
    if (window.HAPTIC) window.HAPTIC.lose();
    if (window.FX) window.FX.flash(0.6);

    if (state.lives <= 0) {
      finish(false);
    } else {
      resetBall();
    }
  }

  /** 一局结束，回调给外部做存档与展示 */
  var onFinish = null;
  var onLevelUp = null;

  function finish(won) {
    state.playing = false;
    state.over = true;
    state.launched = false;

    if (won) {
      if (window.SND) window.SND.win();
      if (window.HAPTIC) window.HAPTIC.heavy();
      if (window.FX) window.FX.flash(0.8);
    } else {
      if (window.SND) window.SND.lose();
      if (window.HAPTIC) window.HAPTIC.lose();
    }

    if (typeof onFinish === 'function') {
      onFinish({
        won: won,
        score: state.score,
        level: state.level,
        diff: state.diff.key,
        speed: state.speed.key
      });
    }
  }

  function addScore(points, row) {
    state.combo++;
    state.comboTimer = 110;
    var mult = 1 + Math.floor(state.combo / 4);
    state.score += Math.round(points * mult * state.diff.scoreMul);

    if (state.score > state.best) state.best = state.score;

    if (window.SND) window.SND.combo(state.combo);
    if (state.combo > 0 && state.combo % 5 === 0) {
      if (window.HAPTIC) window.HAPTIC.medium();
      if (window.FX) window.FX.flash(0.35);
    }
    if (typeof onScore === 'function') onScore(state.score, state.best);
  }

  var onScore = null;

  /* ---------------- 物理 ---------------- */

  function updatePhysics(fs) {
    if (!state.playing || state.paused) return;

    // 挡板平滑跟随
    if (paddle) {
      paddle.position.x += (targetX - paddle.position.x) * Math.min(1, 0.24 * fs);
      var halfLimit = W / 2 - PADDLE_W / 2 - 0.4;
      paddle.position.x = clamp(paddle.position.x, -halfLimit, halfLimit);
    }

    // 连击计时
    if (state.comboTimer > 0) {
      state.comboTimer -= fs;
      if (state.comboTimer <= 0) { state.combo = 0; state.comboTimer = 0; }
    }

    if (!state.launched) {
      if (ballMesh && paddle) {
        ballMesh.position.set(paddle.position.x, paddle.position.y + 1.25, 0);
      }
      return;
    }

    var b = ballMesh;
    if (!b) return;

    b.position.x += vel.x * fs;
    b.position.y += vel.y * fs;
    // 这里是正交正投影下的平面圆盘：绕 X 轴转会把它压成椭圆（cos 效应），
    // 只允许绕 Z 自转——形状不变，高光绕中心转，看起来就是球在滚
    b.rotation.z -= (Math.abs(vel.x) + Math.abs(vel.y)) * fs * 1.6;

    // 左右墙
    if (b.position.x > W / 2 - BALL_R) {
      b.position.x = W / 2 - BALL_R;
      vel.x = -Math.abs(vel.x);
      if (window.SND) window.SND.wall();
    }
    if (b.position.x < -W / 2 + BALL_R) {
      b.position.x = -W / 2 + BALL_R;
      vel.x = Math.abs(vel.x);
      if (window.SND) window.SND.wall();
    }

    // 顶墙
    if (b.position.y > H / 2 - BALL_R) {
      b.position.y = H / 2 - BALL_R;
      vel.y = -Math.abs(vel.y);
      if (window.SND) window.SND.wall();
      if (window.HAPTIC) window.HAPTIC.light();
    }

    // 掉出底部
    if (b.position.y < -H / 2 - 1.2) {
      loseLife();
      return;
    }

    // 挡板
    if (paddle && vel.y < 0) {
      var dxp = b.position.x - paddle.position.x;
      var dyp = b.position.y - paddle.position.y;
      if (Math.abs(dxp) < PADDLE_W / 2 + BALL_R && Math.abs(dyp) < 1.05) {
        // 命中点越靠边，出射角越斜
        var off = clamp(dxp / (PADDLE_W / 2), -1, 1);
        var ang = off * 1.08;
        var sp = Math.sqrt(vel.x * vel.x + vel.y * vel.y) * 1.004;
        vel.x = Math.sin(ang) * sp;
        vel.y = Math.abs(Math.cos(ang)) * sp;
        b.position.y = paddle.position.y + 1.0;
        state.combo = 0;
        if (window.SND) window.SND.paddle();
        if (window.HAPTIC) window.HAPTIC.light();
      }
    }

    // 砖块：先粗筛再精判，避免 O(n) 全算
    for (var i = bricks.length - 1; i >= 0; i--) {
      var br = bricks[i];
      if (!br.alive) continue;

      var bp = br.mesh.position;
      var dxb = b.position.x - bp.x;
      var dyb = b.position.y - bp.y;

      if (Math.abs(dxb) > br.w / 2 + BALL_R) continue;
      if (Math.abs(dyb) > br.h / 2 + BALL_R) continue;

      br.hp--;
      if (br.hp <= 0) {
        br.alive = false;
        spawnBurst(bp.x, bp.y, br.color);
        scene.remove(br.mesh);
        bricks.splice(i, 1);

        if (window.SND) window.SND.brick(br.row);
        if (window.HAPTIC) window.HAPTIC.light();
        addScore(10 * br.maxHp, br.row);
      } else {
        // 受伤：只把填充层压暗一档，描边和投影保持原样
        var darken = 0.72 + Math.min(br.hp, 4) * 0.07;
        br.mesh.userData.fillMat.color.setHex(br.color).multiplyScalar(darken);
        if (window.SND) window.SND.hit();
        if (window.HAPTIC) window.HAPTIC.light();
        addScore(2, br.row);
      }

      // 从哪一面撞进来就反弹哪个轴
      if (Math.abs(dxb) > Math.abs(dyb)) {
        b.position.x = bp.x + (dxb > 0 ? 1 : -1) * (br.w / 2 + BALL_R);
        vel.x = -vel.x;
      } else {
        b.position.y = bp.y + (dyb > 0 ? 1 : -1) * (br.h / 2 + BALL_R);
        vel.y = -vel.y;
      }

      if (window.FX) window.FX.shake(3.4);

      if (bricks.length === 0) {
        state.launched = false;
        setTimeout(function () { nextLevel(); }, 420);
      }
      break;
    }
  }

  /* ---------------- 输入 ---------------- */

  function screenToWorldX(clientX) {
    if (!camera) return 0;
    var ndc = (clientX / window.innerWidth) * 2 - 1;
    var v = new THREE.Vector3(ndc, 0, 0.5).unproject(camera);
    var t = (0 - camera.position.z) / (v.z - camera.position.z);
    return camera.position.x + v.x * t;
  }

  function moveTo(clientX) {
    targetX = clamp(screenToWorldX(clientX), -W / 2, W / 2);
  }

  function nudge(dir, amount) {
    targetX = clamp(targetX + dir * (amount || 1.4), -W / 2, W / 2);
  }

  /* ---------------- 主循环 ---------------- */

  function animate() {
    frameId = requestAnimationFrame(animate);
    var now = performance.now();
    var dt = lastTime ? (now - lastTime) : 16.667;
    lastTime = now;

    var fs = frameScale(dt);

    updatePhysics(fs);
    updateParticles(fs);

    renderer.render(scene, camera);
  }

  /* ---------------- 对外接口 ---------------- */

  window.GAME = {
    DIFFS: DIFFS,
    SPEEDS: SPEEDS,
    FIELD: FIELD,
    LEVEL_MAX: LEVEL_MAX,
    state: state,

    init: function (host) {
      initScene(host);
      window.addEventListener('resize', fitCamera);
      fitCamera();
      animate();
    },

    /** 切换横竖屏：重建场地与砖块，分数生命保留 */
    setOrientation: function (mode) {
      if (mode !== 'portrait' && mode !== 'landscape') return;
      if (orientation === mode) return;

      orientation = mode;
      var f = FIELD[mode];
      W = f.W;
      H = f.H;

      rebuildBackdrop();
      fitCamera();

      if (state.playing) {
        // 横竖屏切换要重排砖块：把当前剩余状态带过去，避免切一下就把本关复原刷分
        var layout = captureLayout();
        if (paddle) paddle.position.set(0, -H / 2 + 2.2, 0);
        buildLevel(state.level, layout);
        resetBall();
      }
    },

    getOrientation: function () { return orientation; },

    start: startGame,

    launch: launchBall,

    moveTo: moveTo,
    nudge: nudge,

    /** 暂停/继续（切到后台时用） */
    setPaused: function (p) {
      state.paused = !!p;
      lastTime = 0;
    },

    onFinish: function (fn) { onFinish = fn; },
    onScore: function (fn) { onScore = fn; },
    onLevelUp: function (fn) { onLevelUp = fn; },

    fit: fitCamera
  };
})();
