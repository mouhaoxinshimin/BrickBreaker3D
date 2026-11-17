# 开发日志 · 打砖块（BrickBreaker3D）

> 维护：某好心市民
> 当前阶段：**已打包、已开源**（v1.0.0 冻结）

---

## 项目定位

三端同源的打砖块小游戏：

| 端 | 载体 | 说明 |
|---|---|---|
| 网页 | `web/index.html` | 唯一视觉基准，纯 HTML + Three.js（离线内置） |
| Windows | `win/` WebView2 外壳 | 加载同一份 `web/`，支持页面请求改窗口尺寸 |
| 安卓 | `android/` WebView 套壳 | `fullSensor`，跟随屏幕方向自动横竖屏 |

视觉不跟「3D 打砖块」这个名字走：**纯平面 2D**，风格沿用 2048 项目的 Q 版可爱卡通——马卡龙浅色填充 + 暖橙粗描边 + 实心偏移投影 + 奶油白底。目录名保留 `BrickBreaker3D` 不做改名。

---

## 2026-11-17 · 原型视觉改造

### 1. 视觉语言迁移（黑底霓虹 → 浅色卡通）
- 3D 场景透明化：`alpha:true`、`setClearColor(0,0)`、删网格与灯光
- 底色改成奶油渐变，面板/按钮统一「奶油底 + 深棕字 + 实心投影」

### 2. 彻底平面化
- `PerspectiveCamera` + `lookAt` 造成的仰角透视被去掉，改 `OrthographicCamera`
- 场地不再有斜视梯形，砖块是正对的圆角矩形

### 3. 全矢量几何重绘
原先用 canvas 贴图做砖块，边缘糊；改成 `ShapeGeometry` 三层实体：
- 投影层（`#D8C4B2`，偏移）→ 描边层 → 填充层
- 球 = 投影圆 + 描边圆 + 黄身 + 白高光
- 挡板 = 蓝胶囊 + 暖橙边

### 4. 竖屏砖块横砌
竖屏固定 5 列、行数 +3（上限 9），砖块始终横向长条；颜色逐块随机分布。

### 5. 难度与球速拉开
- 四档难度：简单 / 普通 / 困难 / 地狱（砖块数、生命、最硬血量、空洞率递增）
- 三档球速：慢 0.72× / 标准 1.00× / 快 1.40×（原差距只有 16%，肉眼分不出）
- 菜单新增实时换算行：`X 行 × Y 列 · N 块砖 · M 条命 · 最硬 K 血 · 球速 ×Z`

### 6. 场地灰线 → 奶油圆角底板
场地区域原来是一圈 1px 的 `LineBasicMaterial` 淡蓝灰线，在浅底上显脏。
改成 `rectMesh` 两层奶油白圆角底板 + 暖褐投影，和按钮同一套质感，场地有了容器感。

### 7. 砖块描边改暖橙
原先描边用 2048 的深棕 `#4A3B32`，配浅马卡龙填充像黑框。
改为统一暖橙 `#E8913C`，球和挡板的边同步。

### 8. 应用图标（SVG → PNG / ICO）
- 矢量源：`assets/icon/app-icon.svg`（1024 视口）
- 栅格化：同一套几何参数 4× 超采样后 LANCZOS 缩回
- 产物：`icon-1024/512/256/128/64/48/32/16.png` + 多尺寸 `app.ico`

### 9. 底部按钮图标扁平化
五个按钮（音效 / 震动 / 震屏 / 横屏-竖屏 / 排行）的彩色 emoji 全部换成内联扁平线性 SVG，颜色跟随文字色；切方向只替换文字节点，不冲掉图标。

### 10. 修掉一个真 bug：球被压成椭圆
球是正交正投影下的平面圆盘，滚动代码却在累加 `rotation.x`。圆盘绕 X 轴一斜就被余弦压缩，屏幕上变成扁椭圆。
改为只绕 Z 轴自转：形状不变，高光绕中心转，视觉上仍是滚动。

---

## 2026-11-17 · 打包与开源

### 11. Windows 外壳
- `win/main.cpp`：WebView2 宿主，虚拟主机 `brick3d.local` 映射到 `web/`
- 窗口尺寸通道：页面 `postMessage('resize:宽x高')` → C++ `add_WebMessageReceived` 解析后 `ResizeClient` 居中改窗口（WebView 内部 `window.resizeTo` 无效，必须走这条）
- `win/app.rc`（GBK/cp936）：图标 + VERSIONINFO，CompanyName「某好心市民」
- `build.bat` → `BUILD_OK`，产物 `BrickBreaker3D.exe` 235 KB

### 12. 安卓外壳
- `MainActivity`：全屏 WebView + `fullSensor` + `configChanges`（旋转不重建 Activity，游戏进度不丢）
- `themes.xml` 改浅色主题，消除启动黑边；`strings.xml` 应用名「打砖块」
- `mipmap-*` 五密度图标已铺；桌面图标显示正常
- `app/build.gradle` 的 `syncWeb` 任务在 `preBuild` 前自动把 `web/` 同步到 `assets/web`，安卓和网页永远同一份代码
- 产物 `app-debug.apk` 319 KB

### 13. 【重要】修掉安卓端点不动的真 bug：整页 `touchstart` 吞掉了 click
`app.js` 里为了拖挡板，在 `#app` 上注册了 `touchstart` / `touchmove`，两个都无条件 `e.preventDefault()`。
触屏上 `touchstart` 被 `preventDefault` 后，浏览器**不会再补发 click**，于是菜单里「开始游戏 / 难度 / 球速 / 底下五个图标」在手机上一个都点不动——
桌面用鼠标走 `mousedown`，所以一直没暴露；`adb input tap` 注入的事件也确实进了 WebView（`deviceId=3 / source=0x1002` 都在），就是没有 click。
修法：两个处理器都先判断 `if (!window.GAME.state.playing) return;`，只有真正在打的时候才拦截默认行为。
修完在模拟器上点「开始游戏」进关卡、点屏幕发射球、打碎砖块、吃到 337 分，粒子也正常跑。

### 14. 修掉 HUD 与砖块重叠（宽视口暴露出来的）
安卓 1600×900 下场地按高度铺，`topY = H/2 - 0.9` 让砖块首行顶到顶部 HUD，「第 1/6 关 · 普通 · 球速 ×1.00」直接压在砖上。
改 `topPad`：横屏 1.55 / 竖屏 2.1，砖块整体下移；同时确认砖块底边与挡板之间仍留出 >1.3 世界单位（球直径 0.9），不影响反弹空间。

### 15. 归档与开源
- `dist/BrickBreaker3D-win64.zip`（exe + web 全量，306 KB）
- `dist/BrickBreaker3D-android.apk`（312 KB）
- `README.md` / `LICENSE`（MIT）
- 推送 GitHub 开源

---

## 验证记录（本机实测）

| 项 | 结果 |
|---|---|
| Windows `build.bat` | `BUILD_OK`，exit 0 |
| Windows 启动 + 切横竖屏 | 窗口 970×680 ↔ 480×820 变形正确，难度换算行同步重算 |
| 安卓 `assembleDebug` | `BUILD SUCCESSFUL`，exit 0 |
| 安卓安装 + 启动 | LDPlayer 1600×900 安装成功，界面无黑边 |
| 安卓触摸 | 点开始 → 进关卡 → 点发射 → 打碎砖块计分 → 粒子动画，全通 |
| 安卓桌面图标 | 奶油底 + 马卡龙砖 + 黄球 + 蓝挡板，显示正常 |

**未能自动验证**：安卓真机旋转（`fullSensor` 只读传感器，`adb settings put user_rotation` 对它无效，模拟器上无法模拟旋转）。旋转重排逻辑与网页端共用同一套代码，网页端已通过「横屏/竖屏」按钮验证。

---

## 已知遗留

- 「画面饱满」的边界：横屏场地约占高 69%、竖屏约 76%，超宽/超窄视口下仍会有留白（底板已经做了圆角容器感）
- 极窄屏（<360px）下底部按钮换行后的间距未精调
- 排行榜未按难度分榜（当前是全局 Top10，榜内记录难度与球速）
- 橙色砖 `#FFC98F` 填充与暖橙描边的对比偏弱，暂按现状保留

---

## 阶段规划

1. ~~建骨架（三端目录）~~
2. ~~原型视觉改造~~
3. ~~原型确认 → 冻结视觉~~
4. ~~Windows 外壳 + 安卓壳编译、反复测试~~
5. ~~终版归档、推送代码仓库~~
