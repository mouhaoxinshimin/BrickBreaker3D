package com.mhxsm.brick3d;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * 打砖块安卓外壳（WebView 套壳）。
 * 玩法与界面全部来自 assets/web/index.html，这里只管开一个全屏 WebView。
 *
 * 屏幕方向：fullSensor，横过来就是横屏、竖起来就是竖屏。
 * 因为 Manifest 里声明了 configChanges，旋转时 Activity 不会重建，
 * WebView 保留原实例，页面收到 resize 事件后自行重排 —— 游戏进度不丢。
 *
 * 作者：某好心市民
 */
public class MainActivity extends Activity {

    private WebView web;

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        Log.d("BBWEB", "dispatchTouchEvent action=" + ev.getAction() + " x=" + ev.getX() + " y=" + ev.getY());
        return super.dispatchTouchEvent(ev);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        keepScreenOn();

        // 完全跟随重力感应（不理会系统「自动旋转」开关）
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);

        web = new WebView(this);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        // 最高分、设置项存在 localStorage，这里必须打开
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setBackgroundColor(0xFFFFF8F0);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // 页面里任何报错都转到 logcat，套壳出问题时 adb logcat -s BBWEB 就能看到
        WebView.setWebContentsDebuggingEnabled(true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d("BBWEB", cm.message() + "  @" + cm.sourceId() + ":" + cm.lineNumber());
                return true;
            }
        });

        web.loadUrl("file:///android_asset/web/index.html");

        setContentView(web);
        hideSystemBars();
    }

    /** 打砖块是持续操作的游戏，玩的时候别让屏幕自动暗下去 */
    private void keepScreenOn() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                  | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                  | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    /**
     * 旋转屏幕时走这里（Activity 没重建）。
     * 先让布局重新测量，再把新尺寸通过 JS 里的 resize 事件交给页面。
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (web != null) {
            // 触发一次重新布局，页面监听 resize 后自行切换横/竖版式
            web.post(new Runnable() {
                @Override
                public void run() {
                    web.requestLayout();
                }
            });
            // 旋转后系统栏可能重新出现，这里再藏一次
            web.postDelayed(new Runnable() {
                @Override
                public void run() {
                    hideSystemBars();
                }
            }, 120);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        if (web != null) web.resumeTimers();
    }

    @Override
    protected void onPause() {
        if (web != null) web.pauseTimers();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        // 页面没有历史记录时，返回键正常退出
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
