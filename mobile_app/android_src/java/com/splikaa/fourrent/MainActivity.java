package com.splikaa.fourrent;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.hardware.biometrics.BiometricPrompt;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Log;
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
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
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
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
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
                // Handle android intent:// scheme safely without exposing internal non-exported components
                if ("intent".equalsIgnoreCase(scheme)) {
                    try {
                        Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                        if (intent != null) {
                            intent.addCategory(Intent.CATEGORY_BROWSABLE);
                            intent.setComponent(null);
                            intent.setSelector(null);
                            startActivity(intent);
                            return true;
                        }
                    } catch (Exception e) {
                        try {
                            Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                            String fallbackUrl = intent != null ? intent.getStringExtra("browser_fallback_url") : null;
                            if (fallbackUrl != null && (fallbackUrl.startsWith("https://") || fallbackUrl.startsWith("http://"))) {
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
                        Uri origin = request.getOrigin();
                        String originHost = origin != null ? origin.getHost() : null;
                        if (!LOCAL_HOST.equalsIgnoreCase(originHost) && !APP_HOST.equalsIgnoreCase(originHost)) {
                            request.deny();
                            return;
                        }

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
        public boolean sharePdfReceipt(final String pdfBase64, final String filename, final String summaryText, final boolean preferMessenger) {
            if (pdfBase64 == null || pdfBase64.trim().isEmpty()) {
                return false;
            }
            try {
                String b64 = pdfBase64.contains(",")
                        ? pdfBase64.substring(pdfBase64.indexOf(",") + 1)
                        : pdfBase64;
                final byte[] pdfBytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                if (pdfBytes == null || pdfBytes.length == 0) {
                    return false;
                }

                final String safeName = ReceiptFileProvider.sanitizePdfFilename(filename);
                final File cacheFile = ReceiptFileProvider.writeSharedReceiptBytes(MainActivity.this, safeName, pdfBytes);
                if (cacheFile == null) {
                    return false;
                }
                final Uri contentUri = ReceiptFileProvider.buildUri(safeName);

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            Intent baseIntent = new Intent(Intent.ACTION_SEND);
                            baseIntent.setType("application/pdf");
                            baseIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                            baseIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
                            if (summaryText != null && !summaryText.trim().isEmpty()) {
                                baseIntent.putExtra(Intent.EXTRA_TEXT, summaryText);
                            }
                            baseIntent.setClipData(ClipData.newUri(getContentResolver(), safeName, contentUri));
                            baseIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                            if (preferMessenger) {
                                String[] messengerPkgs = new String[]{"com.facebook.orca", "com.facebook.mlite"};
                                for (String pkg : messengerPkgs) {
                                    if (isPackageInstalled(pkg)) {
                                        try {
                                            Intent directMessenger = new Intent(baseIntent);
                                            directMessenger.setPackage(pkg);
                                            startActivity(directMessenger);
                                            return;
                                        } catch (Exception e) {
                                            Log.w("4Rent", "Direct PDF Messenger share failed for " + pkg, e);
                                        }
                                    }
                                }
                            }

                            Intent chooser = Intent.createChooser(baseIntent, "Share Official Receipt PDF");
                            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            startActivity(chooser);
                        } catch (Exception e) {
                            Log.e("4Rent", "PDF receipt share failed", e);
                            android.widget.Toast.makeText(
                                    MainActivity.this,
                                    "Unable to open share sheet for PDF receipt.",
                                    android.widget.Toast.LENGTH_SHORT
                            ).show();
                        }
                    }
                });
                return true;
            } catch (Exception e) {
                Log.e("4Rent", "Failed preparing receipt PDF", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean savePdfReceipt(final String pdfBase64, final String filename) {
            if (pdfBase64 == null || pdfBase64.trim().isEmpty()) {
                return false;
            }
            try {
                String b64 = pdfBase64.contains(",")
                        ? pdfBase64.substring(pdfBase64.indexOf(",") + 1)
                        : pdfBase64;
                byte[] pdfBytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                if (pdfBytes == null || pdfBytes.length == 0) {
                    return false;
                }
                String safeName = ReceiptFileProvider.sanitizePdfFilename(filename);

                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/4Rent");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);

                    Uri itemUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (itemUri != null) {
                        boolean wroteOk = false;
                        try (OutputStream out = getContentResolver().openOutputStream(itemUri)) {
                            if (out != null) {
                                out.write(pdfBytes);
                                out.flush();
                                wroteOk = true;
                            }
                        } catch (Exception writeErr) {
                            try {
                                getContentResolver().delete(itemUri, null, null);
                            } catch (Exception ignored) {
                            }
                            throw writeErr;
                        }
                        if (!wroteOk) {
                            try {
                                getContentResolver().delete(itemUri, null, null);
                            } catch (Exception ignored) {
                            }
                        } else {
                            values.clear();
                            values.put(MediaStore.Downloads.IS_PENDING, 0);
                            getContentResolver().update(itemUri, values, null, null);
                            return true;
                        }
                    }
                }
                return sharePdfReceipt(pdfBase64, safeName, "", false);
            } catch (Exception e) {
                Log.e("4Rent", "Failed to save PDF to Downloads", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean savePngReceipt(final String pngBase64, final String filename) {
            if (pngBase64 == null || !pngBase64.contains(",")) {
                return false;
            }
            try {
                String b64 = pngBase64.substring(pngBase64.indexOf(",") + 1);
                byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) {
                    return false;
                }
                String title = (filename != null && !filename.trim().isEmpty())
                        ? filename.trim()
                        : ("4Rent_Receipt_" + System.currentTimeMillis() + ".png");
                String savedPath = MediaStore.Images.Media.insertImage(
                        getContentResolver(),
                        bitmap,
                        title,
                        "4Rent Official Statement & Receipt"
                );
                return savedPath != null;
            } catch (Exception e) {
                Log.e("4Rent", "Failed to save PNG receipt", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean printCurrentPage(final String jobName) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (webView == null) return;
                        PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) return;
                        String safeJob = (jobName != null && !jobName.trim().isEmpty())
                                ? jobName.trim()
                                : "4Rent Official Receipt";
                        PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(safeJob);
                        PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                        printManager.print(safeJob, adapter, attrs);
                    } catch (Exception e) {
                        Log.e("4Rent", "Android PrintManager print failed", e);
                    }
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean shareToMessenger(final String pngBase64, final String summaryText, final String handle) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Uri contentUri = null;
                        if (pngBase64 != null && pngBase64.contains(",")) {
                            try {
                                String b64 = pngBase64.substring(pngBase64.indexOf(",") + 1);
                                byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                                if (bitmap != null) {
                                    String savedPath = MediaStore.Images.Media.insertImage(
                                            getContentResolver(),
                                            bitmap,
                                            "4Rent_Receipt_" + System.currentTimeMillis(),
                                            "4Rent Official Statement & Receipt"
                                    );
                                    if (savedPath != null) {
                                        contentUri = Uri.parse(savedPath);
                                    }
                                }
                            } catch (Exception e) {
                                Log.e("4Rent", "Failed to save receipt image to MediaStore", e);
                            }
                        }

                        // Always prioritize sending the receipt attachment rather than stripping it for m.me
                        if (isPackageInstalled("com.facebook.orca") && contentUri != null) {
                            try {
                                Intent directMessenger = new Intent(Intent.ACTION_SEND);
                                directMessenger.setType("image/png");
                                directMessenger.putExtra(Intent.EXTRA_STREAM, contentUri);
                                if (summaryText != null && !summaryText.isEmpty()) {
                                    directMessenger.putExtra(Intent.EXTRA_TEXT, summaryText);
                                }
                                directMessenger.setPackage("com.facebook.orca");
                                directMessenger.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                startActivity(directMessenger);
                                return;
                            } catch (Exception e) {
                                Log.e("4Rent", "Direct Messenger share failed, showing chooser", e);
                            }
                        }

                        Intent sendIntent = new Intent(Intent.ACTION_SEND);
                        if (contentUri != null) {
                            sendIntent.setType("image/png");
                            sendIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                            if (summaryText != null && !summaryText.isEmpty()) {
                                sendIntent.putExtra(Intent.EXTRA_TEXT, summaryText);
                            }
                            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                        } else {
                            sendIntent.setType("text/plain");
                            if (summaryText != null && !summaryText.isEmpty()) {
                                sendIntent.putExtra(Intent.EXTRA_TEXT, summaryText);
                            }
                        }

                        Intent chooser = Intent.createChooser(sendIntent, "Share Official Receipt");
                        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
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
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P;
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
                                                String msg = errString != null && errString.length() > 0
                                                        ? errString.toString()
                                                        : "Biometric verification failed. Use 4-Digit PIN.";
                                                notifyBiometricResult(false, msg);
                                            }
                                        }

                                        @Override
                                        public void onAuthenticationFailed() {
                                            super.onAuthenticationFailed();
                                        }
                                    }
                            );
                            return;
                        } catch (Exception e) {
                            notifyBiometricResult(false, "Biometric authentication failed. Use 4-Digit PIN.");
                            return;
                        }
                    }
                    notifyBiometricResult(false, "Biometric authentication is not supported on this Android version. Use 4-Digit PIN.");
                }
            });
        }
    }

    private void notifyBiometricResult(final boolean ok, final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    String quotedMsg = org.json.JSONObject.quote(message != null ? message : "");
                    String js = "if (window.__onAndroidBiometricResult) { window.__onAndroidBiometricResult(" + ok + ", " + quotedMsg + "); }";
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
            headers.put("Access-Control-Allow-Origin", "https://" + LOCAL_HOST);
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

    /**
     * Zero-dependency framework ContentProvider serving cached PDF receipts cleanly
     * via content:// URIs for Messenger and Android system share sheets.
     */
    public static class ReceiptFileProvider extends ContentProvider {
        private static final String AUTHORITY = "com.splikaa.fourrent.fileprovider";
        private static final String SUBDIR = "shared_receipts";

        static String sanitizePdfFilename(String raw) {
            String base = (raw != null ? raw : "4Rent_Receipt.pdf").trim();
            base = base.replaceAll("[^a-zA-Z0-9._-]+", "_");
            if (base.isEmpty()) base = "4Rent_Receipt";
            if (!base.toLowerCase().endsWith(".pdf")) {
                base = base + ".pdf";
            }
            return base;
        }

        static File writeSharedReceiptBytes(Context ctx, String safeName, byte[] data) {
            try {
                File dir = new File(ctx.getCacheDir(), SUBDIR);
                if (!dir.exists()) {
                    dir.mkdirs();
                } else {
                    File[] existing = dir.listFiles();
                    if (existing != null) {
                        long cutoffMs = System.currentTimeMillis() - 60L * 60L * 1000L;
                        for (File oldFile : existing) {
                            if (oldFile.isFile() && oldFile.lastModified() < cutoffMs) {
                                //noinspection ResultOfMethodCallIgnored
                                oldFile.delete();
                            }
                        }
                    }
                }
                File outFile = new File(dir, safeName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(data);
                    fos.flush();
                }
                return outFile;
            } catch (Exception e) {
                Log.e("4Rent", "Failed writing shared receipt cache file", e);
                return null;
            }
        }

        static Uri buildUri(String safeName) {
            return new Uri.Builder()
                    .scheme("content")
                    .authority(AUTHORITY)
                    .appendPath("receipts")
                    .appendPath(safeName)
                    .build();
        }

        private File resolveSafeFile(Uri uri) throws FileNotFoundException {
            Context ctx = getContext();
            if (ctx == null || uri == null) {
                throw new FileNotFoundException("Unavailable provider context");
            }
            String segment = uri.getLastPathSegment();
            if (segment == null || segment.trim().isEmpty()) {
                throw new FileNotFoundException("Missing file segment");
            }
            File dir = new File(ctx.getCacheDir(), SUBDIR);
            File target = new File(dir, new File(segment).getName());
            try {
                String baseCanonical = dir.getCanonicalPath() + File.separator;
                String targetCanonical = target.getCanonicalPath();
                if (!targetCanonical.startsWith(baseCanonical) || !target.exists()) {
                    throw new FileNotFoundException("Invalid receipt URI: " + uri);
                }
                return target;
            } catch (FileNotFoundException fnf) {
                throw fnf;
            } catch (Exception e) {
                throw new FileNotFoundException("Unable to open receipt file");
            }
        }

        @Override
        public boolean onCreate() {
            return true;
        }

        @Override
        public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
            try {
                File file = resolveSafeFile(uri);
                String[] cols = projection != null
                        ? projection
                        : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
                MatrixCursor cursor = new MatrixCursor(cols, 1);
                Object[] row = new Object[cols.length];
                for (int i = 0; i < cols.length; i++) {
                    if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) {
                        row[i] = file.getName();
                    } else if (OpenableColumns.SIZE.equals(cols[i])) {
                        row[i] = file.length();
                    } else {
                        row[i] = null;
                    }
                }
                cursor.addRow(row);
                return cursor;
            } catch (FileNotFoundException e) {
                return new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, 0);
            }
        }

        @Override
        public String getType(Uri uri) {
            String path = uri != null ? uri.toString().toLowerCase() : "";
            if (path.endsWith(".png")) return "image/png";
            return "application/pdf";
        }

        @Override
        public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
            if (mode == null || !mode.equals("r")) {
                throw new SecurityException("Read-only receipt provider");
            }
            File file = resolveSafeFile(uri);
            return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
        }

        @Override
        public Uri insert(Uri uri, ContentValues values) {
            return null;
        }

        @Override
        public int delete(Uri uri, String selection, String[] selectionArgs) {
            return 0;
        }

        @Override
        public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
            return 0;
        }
    }
}
