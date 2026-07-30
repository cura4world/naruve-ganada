package app.naruve.ganada;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

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
