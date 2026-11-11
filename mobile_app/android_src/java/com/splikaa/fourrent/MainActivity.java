package com.splikaa.fourrent;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.biometrics.BiometricPrompt;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.provider.MediaStore;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
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
    private static final int CAMERA_PERMISSION_REQUEST_CODE = 2001;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 2002;

    private static final String NOTIFICATION_CHANNEL_ID = "four_rent_alerts";
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String APP_HOST = "splikaa.github.io";
    private static final String START_URL = "https://" + LOCAL_HOST + "/index.html?mobile=1";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingWebPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= 24) {
            try {
                android.os.StrictMode.VmPolicy.Builder builder = new android.os.StrictMode.VmPolicy.Builder();
                android.os.StrictMode.setVmPolicy(builder.build());
            } catch (Exception ignored) {
            }
        }

        try {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#090D14"));
            window.setNavigationBarColor(Color.parseColor("#0B0F17"));
        } catch (Exception ignored) {
        }

        initNotificationChannel();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#090D14"));

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

        // Expose Native Android Hardware Bridges to JavaScript
        webView.addJavascriptInterface(new AndroidBiometricBridge(), "AndroidBiometrics");
        webView.addJavascriptInterface(new AndroidNativeBridge(), "AndroidNative");

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
                // Handle android intent:// scheme safely without triggering net::ERR_UNKNOWN_URL_SCHEME
                if ("intent".equalsIgnoreCase(scheme)) {
                    try {
                        Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                        if (intent != null) {
                            startActivity(intent);
                            return true;
                        }
                    } catch (Exception e) {
                        try {
                            Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                            String fallbackUrl = intent != null ? intent.getStringExtra("browser_fallback_url") : null;
                            if (fallbackUrl != null) {
                                view.loadUrl(fallbackUrl);
                                return true;
                            }
                        } catch (Exception ignored) {
                        }
                    }
                    return true;
                }

                // Deep link directly to Messenger app if installed
                if ("fb-messenger".equalsIgnoreCase(scheme)) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                        return true;
                    } catch (Exception ignored) {
                    }
                }

                if ("m.me".equalsIgnoreCase(host) || (host != null && host.contains("messenger.com"))) {
                    try {
                        Intent messengerIntent = new Intent(Intent.ACTION_VIEW, uri);
                        if (isPackageInstalled("com.facebook.orca")) {
                            messengerIntent.setPackage("com.facebook.orca");
                        } else if (isPackageInstalled("com.facebook.mlite")) {
                            messengerIntent.setPackage("com.facebook.mlite");
                        }
                        startActivity(messengerIntent);
                        return true;
                    } catch (Exception ignored) {
                    }
                }

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
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        boolean requiresCamera = false;
                        for (String res : request.getResources()) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                                requiresCamera = true;
                                break;
                            }
                        }

                        if (requiresCamera && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            if (checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
                                pendingWebPermissionRequest = request;
                                requestPermissions(new String[]{"android.permission.CAMERA"}, CAMERA_PERMISSION_REQUEST_CODE);
                                return;
                            }
                        }

                        request.grant(request.getResources());
                    }
                });
            }

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

                Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                Intent galleryIntent = new Intent(Intent.ACTION_GET_CONTENT);
                galleryIntent.addCategory(Intent.CATEGORY_OPENABLE);
                galleryIntent.setType("image/*");

                Intent chooser = Intent.createChooser(galleryIntent, "Capture or Select Sub-Meter Photo");
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cameraIntent});

                try {
                    startActivityForResult(chooser, FILE_CHOOSER_RESULT_CODE);
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

    private void initNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    NotificationChannel channel = new NotificationChannel(
                            NOTIFICATION_CHANNEL_ID,
                            "4Rent Billing & Due Window Reminders",
                            NotificationManager.IMPORTANCE_HIGH
                    );
                    channel.setDescription("Day 1–10 billing and official receipt notifications");
                    channel.enableLights(true);
                    channel.setLightColor(Color.parseColor("#F59E0B"));
                    channel.enableVibration(true);
                    manager.createNotificationChannel(channel);
                }
            } catch (Exception ignored) {
            }
        }
    }

    private boolean isPackageInstalled(String packageName) {
        try {
            getPackageManager().getPackageInfo(packageName, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public class AndroidNativeBridge {
        @JavascriptInterface
        public String getNetworkType() {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    NetworkInfo active = cm.getActiveNetworkInfo();
                    if (active != null && active.isConnected()) {
                        int type = active.getType();
                        if (type == ConnectivityManager.TYPE_WIFI) {
                            return "wifi";
                        } else if (type == ConnectivityManager.TYPE_MOBILE) {
                            return "cellular";
                        }
                        return "wifi";
                    }
                }
            } catch (Exception ignored) {
            }
            return "offline";
        }

        @JavascriptInterface
        public boolean areNotificationsEnabled() {
            try {
                NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        return manager.areNotificationsEnabled();
                    }
                    return true;
                }
            } catch (Exception ignored) {
            }
            return true;
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(Uri.fromParts("package", getPackageName(), null));
                        startActivity(intent);
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean hasCameraPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return checkSelfPermission("android.permission.CAMERA") == PackageManager.PERMISSION_GRANTED;
            }
            return true;
        }

        @JavascriptInterface
        public void requestCameraPermission() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        if (checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
                            requestPermissions(new String[]{"android.permission.CAMERA"}, CAMERA_PERMISSION_REQUEST_CODE);
                        } else {
                            notifyCameraPermissionResult(true);
                        }
                    } else {
                        notifyCameraPermissionResult(true);
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean requestAndVerifyNotification(final String title, final String body) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= 33) {
                        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, NOTIFICATION_PERMISSION_REQUEST_CODE);
                            return;
                        }
                    }
                    sendTestNotification(title, body);
                    notifyNotificationResult(true);
                }
            });
            return areNotificationsEnabled();
        }

        @JavascriptInterface
        public boolean shareToMessenger(final String pngBase64, final String summaryText, final String handle) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        // If specific handle is provided, open direct m.me chat thread
                        if (handle != null && !handle.trim().isEmpty()) {
                            try {
                                Intent directIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://m.me/" + handle.trim()));
                                startActivity(directIntent);
                                return;
                            } catch (Exception ignored) {
                            }
                        }

                        Intent sendIntent = new Intent(Intent.ACTION_SEND);
                        if (pngBase64 != null && pngBase64.contains(",")) {
                            try {
                                String b64 = pngBase64.substring(pngBase64.indexOf(",") + 1);
                                byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                                java.io.File cacheDir = getCacheDir();
                                java.io.File imgFile = new java.io.File(cacheDir, "4Rent_Receipt.png");
                                java.io.FileOutputStream fos = new java.io.FileOutputStream(imgFile);
                                fos.write(bytes);
                                fos.close();
                                imgFile.setReadable(true, false);
                                Uri fileUri = Uri.fromFile(imgFile);
                                sendIntent.setType("image/png");
                                sendIntent.putExtra(Intent.EXTRA_STREAM, fileUri);
                                sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            } catch (Exception e) {
                                sendIntent.setType("text/plain");
                                sendIntent.putExtra(Intent.EXTRA_TEXT, summaryText);
                            }
                        } else {
                            sendIntent.setType("text/plain");
                            sendIntent.putExtra(Intent.EXTRA_TEXT, summaryText);
                        }

                        Intent chooser = Intent.createChooser(sendIntent, "Share Receipt Image");
                        startActivity(chooser);
                    } catch (Exception e) {
                        try {
                            String target = (handle != null && !handle.trim().isEmpty())
                                    ? "https://m.me/" + handle.trim()
                                    : "https://www.messenger.com/";
                            Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                            startActivity(webIntent);
                        } catch (Exception ignored) {
                        }
                    }
                }
            });
            return true;
        }
    }

    private void sendTestNotification(String title, String body) {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            android.app.Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new android.app.Notification.Builder(this, NOTIFICATION_CHANNEL_ID);
            } else {
                builder = new android.app.Notification.Builder(this);
            }

            builder.setContentTitle(title != null ? title : "4Rent Management System")
                    .setContentText(body != null ? body : "Billing & Due-Date Reminders are Active")
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setAutoCancel(true);

            manager.notify(101, builder.build());
        } catch (Exception ignored) {
        }
    }

    private void notifyCameraPermissionResult(final boolean granted) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    String js = "if (window.__onAndroidCameraPermissionResult) { window.__onAndroidCameraPermissionResult(" + granted + "); }";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        webView.evaluateJavascript(js, null);
                    } else {
                        webView.loadUrl("javascript:" + js);
                    }
                }
            }
        });
    }

    private void notifyNotificationResult(final boolean granted) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    String js = "if (window.__onAndroidNotificationPermissionResult) { window.__onAndroidNotificationPermissionResult(" + granted + "); }";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        webView.evaluateJavascript(js, null);
                    } else {
                        webView.loadUrl("javascript:" + js);
                    }
                }
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == CAMERA_PERMISSION_REQUEST_CODE) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (pendingWebPermissionRequest != null) {
                if (granted) {
                    pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
                } else {
                    pendingWebPermissionRequest.deny();
                }
                pendingWebPermissionRequest = null;
            }
            notifyCameraPermissionResult(granted);
        } else if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                sendTestNotification("4Rent Notifications Verified ✓", "Day 1–10 billing alerts are active on this phone.");
            }
            notifyNotificationResult(granted);
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        }
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
                                    .setSubtitle(subtitle != null ? subtitle : "Touch fingerprint sensor to authenticate")
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
                                                notifyBiometricResult(false, "Fingerprint scan cancelled. Tap to retry.");
                                            } else {
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
                } else if (data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                    results = new Uri[]{data.getClipData().getItemAt(0).getUri()};
                } else if (data.getExtras() != null && data.getExtras().get("data") instanceof android.graphics.Bitmap) {
                    android.graphics.Bitmap bmp = (android.graphics.Bitmap) data.getExtras().get("data");
                    if (bmp != null) {
                        try {
                            java.io.File cacheFile = new java.io.File(getCacheDir(), "submeter_snap_" + System.currentTimeMillis() + ".jpg");
                            java.io.FileOutputStream fos = new java.io.FileOutputStream(cacheFile);
                            bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 96, fos);
                            fos.flush();
                            fos.close();
                            results = new Uri[]{Uri.fromFile(cacheFile)};
                        } catch (Exception ignored) {
                        }
                    }
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
