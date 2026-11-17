/* 打砖块 · Windows 外壳（WebView2）
 * 只负责开窗口、把 web 目录挂成 https 源、加载页面。
 * 玩法与界面全部来自 web/index.html，这里不写任何游戏逻辑。
 *
 * 额外能力：页面可以发 "resize:宽x高" 字符串消息让窗口跟着变形，
 * 用来实现页面内「横竖屏切换」按钮在桌面端的完整体验
 * （WebView 里 window.resizeTo 是无效的，只能靠外壳配合）。
 *
 * 构建：双击 build.bat，或命令行执行 build.bat
 * 作者：某好心市民
 */

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <shellapi.h>
#include <string>
#include <cwchar>
#include <WebView2.h>
#include <wrl.h>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "shell32.lib")

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Callback;

static ComPtr<ICoreWebView2Controller> g_ctl;
static ComPtr<ICoreWebView2> g_view;
static HWND g_hwnd = nullptr;

static const wchar_t* kClassName = L"BrickBreaker3DWindow";
static const wchar_t* kTitle     = L"打砖块";

/* ---------- 路径 ---------- */

static std::wstring ExeDir()
{
    wchar_t buf[MAX_PATH] = { 0 };
    GetModuleFileNameW(nullptr, buf, MAX_PATH);
    std::wstring p(buf);
    size_t pos = p.find_last_of(L"\\/");
    if (pos != std::wstring::npos) p.erase(pos);
    return p;
}

static std::wstring ParentDir(const std::wstring& p)
{
    size_t pos = p.find_last_of(L"\\/");
    return (pos == std::wstring::npos) ? p : p.substr(0, pos);
}

/* WebView2 的用户数据目录放 LocalAppData，程序目录可能没有写权限 */
static std::wstring DataDir()
{
    wchar_t* lp = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &lp)) || !lp)
        return L".";
    std::wstring d(lp);
    CoTaskMemFree(lp);
    if (!d.empty() && (d.back() == L'\\' || d.back() == L'/')) d.pop_back();
    d += L"\\GameBrick3D\\EBWebView";
    SHCreateDirectoryExW(nullptr, d.c_str(), nullptr);
    return d;
}

/* 找 web 目录：先看 exe 同级，再看上一级（开发时 exe 在 win\ 里） */
static std::wstring FindWebDir()
{
    std::wstring base = ExeDir();

    std::wstring beside = base + L"\\web";
    if (PathFileExistsW((beside + L"\\index.html").c_str())) return beside;

    std::wstring upper = ParentDir(base) + L"\\web";
    if (PathFileExistsW((upper + L"\\index.html").c_str())) return upper;

    return beside;
}

/* ---------- WebView2 ---------- */

static void UpdateBounds()
{
    if (!g_ctl || !g_hwnd) return;
    RECT rc;
    GetClientRect(g_hwnd, &rc);
    g_ctl->put_Bounds(rc);
}

/* 把客户区改成指定尺寸，并尽量保持窗口居中 */
static void ResizeClient(int cw, int ch)
{
    if (!g_hwnd) return;

    RECT wa = { 0, 0, 0, 0 };
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &wa, 0);
    int availW = wa.right - wa.left;
    int availH = wa.bottom - wa.top;
    if (availW <= 0) availW = GetSystemMetrics(SM_CXSCREEN);
    if (availH <= 0) availH = GetSystemMetrics(SM_CYSCREEN);

    if (cw < 360) cw = 360;
    if (ch < 520) ch = 520;
    if (cw > availW - 40) cw = availW - 40;
    if (ch > availH - 40) ch = availH - 40;

    RECT rc = { 0, 0, cw, ch };
    AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW, FALSE);
    int ww = rc.right - rc.left;
    int wh = rc.bottom - rc.top;

    GetWindowRect(g_hwnd, &rc);
    int px = rc.left;
    int py = rc.top;
    px = wa.left + (availW - ww) / 2;
    py = wa.top + (availH - wh) / 2;
    if (px < wa.left) px = wa.left;
    if (py < wa.top) py = wa.top;

    SetWindowPos(g_hwnd, nullptr, px, py, ww, wh, SWP_NOZORDER | SWP_NOACTIVATE);
}

/* 处理页面发来的 "resize:960x640" */
static void OnWebMessage(const std::wstring& msg)
{
    const std::wstring prefix = L"resize:";
    if (msg.size() <= prefix.size()) return;
    if (msg.compare(0, prefix.size(), prefix) != 0) return;

    int w = 0, h = 0;
    if (swscanf_s(msg.c_str() + prefix.size(), L"%dx%d", &w, &h) == 2 && w > 0 && h > 0)
        ResizeClient(w, h);
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg)
    {
    case WM_SIZE:
        UpdateBounds();
        return 0;

    case WM_GETMINMAXINFO:
    {
        MINMAXINFO* mm = reinterpret_cast<MINMAXINFO*>(lp);
        mm->ptMinTrackSize.x = 360;
        mm->ptMinTrackSize.y = 520;
        return 0;
    }

    case WM_DESTROY:
        if (g_ctl) g_ctl->Close();
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

static HRESULT StartWebView(const std::wstring& webDir)
{
    std::wstring dataDir = DataDir();

    return CreateCoreWebView2EnvironmentWithOptions(
        nullptr, dataDir.c_str(), nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [webDir](HRESULT hr, ICoreWebView2Environment* env) -> HRESULT
            {
                if (FAILED(hr) || !env)
                {
                    MessageBoxW(g_hwnd,
                        L"WebView2 运行时初始化失败。\n\n"
                        L"本程序依赖系统的 Microsoft Edge WebView2 Runtime，\n"
                        L"Windows 10/11 一般已内置；若缺失请安装后再试。",
                        kTitle, MB_ICONERROR | MB_OK);
                    return hr;
                }

                return env->CreateCoreWebView2Controller(
                    g_hwnd,
                    Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [webDir](HRESULT hr2, ICoreWebView2Controller* ctl) -> HRESULT
                        {
                            if (FAILED(hr2) || !ctl) return hr2;

                            g_ctl = ctl;
                            g_ctl->put_IsVisible(TRUE);
                            UpdateBounds();
                            g_ctl->get_CoreWebView2(&g_view);
                            if (!g_view) return E_FAIL;

                            ComPtr<ICoreWebView2Settings> st;
                            if (SUCCEEDED(g_view->get_Settings(&st)) && st)
                            {
                                st->put_IsScriptEnabled(TRUE);
                                // 页面内自带提示与确认，不需要浏览器原生弹窗
                                st->put_AreDefaultScriptDialogsEnabled(FALSE);
                                st->put_IsStatusBarEnabled(FALSE);
                                st->put_AreDefaultContextMenusEnabled(FALSE);
                                st->put_AreDevToolsEnabled(FALSE);
                                st->put_IsZoomControlEnabled(FALSE);
                                st->put_IsBuiltInErrorPageEnabled(TRUE);
                            }

                            // 页面 → 外壳：窗口尺寸请求（横竖屏切换用）
                            ComPtr<ICoreWebView2Settings> unused;
                            g_view->add_WebMessageReceived(
                                Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                                    [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT
                                    {
                                        LPWSTR text = nullptr;
                                        if (!args) return S_OK;
                                        // 只有字符串型消息能取，JSON 型这里拿不到也无所谓
                                        if (SUCCEEDED(args->TryGetWebMessageAsString(&text)) && text)
                                        {
                                            std::wstring msg(text);
                                            CoTaskMemFree(text);
                                            OnWebMessage(msg);
                                        }
                                        return S_OK;
                                    }).Get(), nullptr);

                            // 把 web 目录挂成 https 源：localStorage 才有正常来源
                            ComPtr<ICoreWebView2_3> v3;
                            if (SUCCEEDED(g_view.As(&v3)) && v3)
                            {
                                v3->SetVirtualHostNameToFolderMapping(
                                    L"brick3d.local", webDir.c_str(),
                                    COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
                                g_view->Navigate(L"https://brick3d.local/index.html");
                            }
                            else
                            {
                                std::wstring fileUrl = L"file:///" + webDir;
                                for (auto& ch : fileUrl) if (ch == L'\\') ch = L'/';
                                fileUrl += L"/index.html";
                                g_view->Navigate(fileUrl.c_str());
                            }
                            return S_OK;
                        }).Get());
            }).Get());
}

/* ---------- 入口 ---------- */

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, LPWSTR, int nCmdShow)
{
    SetProcessDPIAware();
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    WNDCLASSEXW wc = {};
    wc.cbSize        = sizeof(wc);
    wc.style         = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc   = WndProc;
    wc.hInstance     = hInst;
    wc.hCursor       = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    wc.lpszClassName = kClassName;
    RegisterClassExW(&wc);

    RECT wa = { 0, 0, 0, 0 };
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &wa, 0);
    int availW = wa.right - wa.left;
    int availH = wa.bottom - wa.top;
    if (availW <= 0) availW = GetSystemMetrics(SM_CXSCREEN);
    if (availH <= 0) availH = GetSystemMetrics(SM_CYSCREEN);

    // 打砖块以横屏为主视觉，默认给一个略宽的窗口。
    // 页面内切换竖屏时，会通过 web message 请求外壳改成竖版尺寸。
    int cw = 980;
    int ch = 640;
    if (cw > availW - 60) cw = availW - 60;
    if (ch > availH - 30) ch = availH - 30;

    RECT rc = { 0, 0, cw, ch };
    AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW, FALSE);
    int ww = rc.right - rc.left;
    int wh = rc.bottom - rc.top;

    int px = wa.left + (availW - ww) / 2;
    int py = wa.top + (availH - wh) / 2;
    if (py < wa.top) py = wa.top;
    if (px < wa.left) px = wa.left;

    g_hwnd = CreateWindowExW(
        0, kClassName, kTitle, WS_OVERLAPPEDWINDOW,
        px, py, ww, wh,
        nullptr, nullptr, hInst, nullptr);
    if (!g_hwnd) return 1;

    std::wstring webDir = FindWebDir();
    if (!PathFileExistsW((webDir + L"\\index.html").c_str()))
    {
        MessageBoxW(g_hwnd,
            L"没有找到 web\\index.html。\n\n"
            L"请把 web 文件夹放在本程序同级目录，或保持 win\\ 与 web\\ 同级。",
            kTitle, MB_ICONERROR | MB_OK);
        return 1;
    }

    ShowWindow(g_hwnd, nCmdShow);
    UpdateWindow(g_hwnd);

    StartWebView(webDir);

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    g_view.Reset();
    g_ctl.Reset();
    CoUninitialize();
    return 0;
}
