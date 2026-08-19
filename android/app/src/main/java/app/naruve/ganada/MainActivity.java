package app.naruve.ganada;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/* targetSdk 36, so Android forces edge-to-edge: the WebView fills the whole
   window, underneath the status bar and the navigation bar.

   WebView only maps the *display cutout* into env(safe-area-inset-*). System
   bars never reach CSS, so env(safe-area-inset-bottom) is 0 here no matter
   what app.css does — that is why the tab labels sat on top of the navigation
   bar. The inset has to be applied on the native side.

   With this listener the WebView is padded inside the bars and the CSS
   variables (--safe-top / --safe-bottom in app.css) resolve to 0, which is
   correct: the padding is already accounted for. In a plain browser or an
   installed PWA nothing changes — this file is not involved there.        */
public class MainActivity extends BridgeActivity {

    /* --paper in app.css */
    private static final int PAPER = Color.parseColor("#FBFAF6");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        /* 시스템 접근성 글꼴 배율을 무시하고 100%로 고정한다.

           WebView 는 시스템 글꼴 크기를 textZoom 으로 곱해 적용한다. 크롬보다
           글자가 크게 나와 한 화면에 안 들어오고 하단 탭 글자가 잘렸다.
           CSS 의 text-size-adjust 로는 막을 수 없다 — 그쪽은 텍스트
           자동확대(font boosting)를 끄는 것이고 textZoom 과 다른 경로다.

           **시스템 글꼴 설정을 무시하는 선택이다.** 첫 버전은 레이아웃 안정을
           우선한다. 앱 안에 글꼴 크기 설정을 두는 것은 P6-B 이후 후보다
           (README 참조). 그때 이 줄을 그 설정과 연결한다. */
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) wv.getSettings().setTextZoom(100);

        View content = findViewById(android.R.id.content);

        // the strips left behind the bars would otherwise show the null
        // window background
        content.setBackgroundColor(PAPER);

        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
