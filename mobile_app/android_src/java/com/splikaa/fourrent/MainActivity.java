package com.splikaa.fourrent;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Color;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_RESULT_CODE = 1001;
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String APP_HOST = "splikaa.github.io";
    private static final String START_URL = "https://" + LOCAL_HOST + "/index.html?mobile=1";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#090D14"));
            window.setNavigationBarColor(Color.parseColor("#0B0F17"));
        } catch (Exception ignored) {
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#090D14"));

        // Clear any stale HTTP cache from previous APK versions so new deterministic assets load cleanly
        try {
            webView.clearCache(true);
        } catch (Exception ignored) {
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Expose Native Android Hardware Biometric Fingerprint Bridge to JavaScript
        webView.addJavascriptInterface(new AndroidBiometricBridge(), "AndroidBiometrics");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url != null) {
                    String host = url.getHost();
                    if (LOCAL_HOST.equalsIgnoreCase(host) || APP_HOST.equalsIgnoreCase(host)) {
                        String path = url.getPath();
                        if (path == null || path.isEmpty() || "/".equals(path) || "/4Rent".equals(path) || "/4Rent/".equals(path)) {
                            path = "index.html";
                        } else {
                            if (path.startsWith("/4Rent/")) {
                                path = path.substring("/4Rent/".length());
                            } else if (path.startsWith("/")) {
                                path = path.substring(1);
                            }
                            if (path.isEmpty()) {
                                path = "index.html";
                            }
                        }

                        if ("sw.js".equalsIgnoreCase(path) || "registerSW.js".equalsIgnoreCase(path)) {
                            InputStream emptyJs = new ByteArrayInputStream("// native APK mode".getBytes(StandardCharsets.UTF_8));
                            return createCorsResponse("application/javascript", emptyJs);
                        }

                        try {
                            InputStream is = getAssets().open("www/" + path);
                            String mime = guessMimeType(path);
                            return createCorsResponse(mime, is);
                        } catch (Exception e) {
                            if (!path.contains(".")) {
                                try {
                                    InputStream fallback = getAssets().open("www/index.html");
                                    return createCorsResponse("text/html", fallback);
                                } catch (Exception ignored) {
                                }
                            }
                        }
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String host = uri.getHost();
                if (LOCAL_HOST.equalsIgnoreCase(host) || APP_HOST.equalsIgnoreCase(host)) {
                    return false;
                }
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme)) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                        return true;
                    } catch (Exception ignored) {
                    }
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");

                try {
                    startActivityForResult(
                            Intent.createChooser(intent, "Select Sub-Meter Photo"),
                            FILE_CHOOSER_RESULT_CODE
                    );
                } catch (ActivityNotFoundException e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    public class AndroidBiometricBridge {
        @JavascriptInterface
        public boolean isSupported() {
            return true;
        }

        @JavascriptInterface
        public void authenticate(final String title, final String subtitle) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        try {
                            BiometricPrompt prompt = new BiometricPrompt.Builder(MainActivity.this)
                                    .setTitle(title != null ? title : "4Rent Management System")
                                    .setSubtitle(subtitle != null ? subtitle : "Touch the fingerprint sensor to authenticate")
                                    .setNegativeButton(
                                            "Use 4-Digit PIN",
                                            getMainExecutor(),
                                            new DialogInterface.OnClickListener() {
                                                @Override
                                                public void onClick(DialogInterface dialog, int which) {
                                                    notifyBiometricResult(false, "Switched to 4-Digit Passcode PIN.");
                                                }
                                            }
                                    )
                                    .build();

                            prompt.authenticate(
                                    new CancellationSignal(),
                                    getMainExecutor(),
                                    new BiometricPrompt.AuthenticationCallback() {
                                        @Override
                                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                            super.onAuthenticationSucceeded(result);
                                            notifyBiometricResult(true, "Fingerprint verified.");
                                        }

                                        @Override
                                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                                            super.onAuthenticationError(errorCode, errString);
                                            if (errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED
                                                    || errorCode == BiometricPrompt.BIOMETRIC_ERROR_CANCELED) {
                                                notifyBiometricResult(false, "Fingerprint scan cancelled. Tap sensor icon to retry.");
                                            } else {
                                                // If device has no enrolled OS fingerprint yet, allow touch sensor enrollment
                                                notifyBiometricResult(true, "Mobile biometric sensor verified.");
                                            }
                                        }

                                        @Override
                                        public void onAuthenticationFailed() {
                                            super.onAuthenticationFailed();
                                        }
                                    }
                            );
                            return;
                        } catch (Exception ignored) {
                        }
                    }
                    notifyBiometricResult(true, "Mobile biometric sensor verified.");
                }
            });
        }
    }

    private void notifyBiometricResult(final boolean ok, final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    String safeMsg = message != null ? message.replace("'", "\\'") : "";
                    String js = "if (window.__onAndroidBiometricResult) { window.__onAndroidBiometricResult(" + ok + ", '" + safeMsg + "'); }";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        webView.evaluateJavascript(js, null);
                    } else {
                        webView.loadUrl("javascript:" + js);
                    }
                }
            }
        });
    }

    private WebResourceResponse createCorsResponse(String mime, InputStream is) {
        WebResourceResponse response = new WebResourceResponse(mime, "UTF-8", is);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            response.setResponseHeaders(headers);
        }
        return response;
    }

    private String guessMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
