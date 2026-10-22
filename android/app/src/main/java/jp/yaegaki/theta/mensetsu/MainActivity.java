package jp.yaegaki.theta.mensetsu;

import android.Manifest;
import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.database.Cursor;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

// The app: the shared screen and backend (ui/ + desktop/lib, built by web/ into assets/www) run
// in a WebView served from https://appassets.androidplatform.net; this class supplies what the
// phone does natively — Google's document scanner, Google account access through Play services,
// files and sharing, the camera / microphone permissions, the back button. JavaScript calls
// AndroidNative.call(method, json, id); answers come back through window.AndroidReply(id, json).
public class MainActivity extends ComponentActivity {
  static final String HOST = "appassets.androidplatform.net";
  static final String START = "https://" + HOST + "/www/index.html";
  static final int SCAN = 1, AUTH = 2, ACCOUNT = 3, SAVE = 4, FILES = 5, PERMS = 6;
  static final String SCOPE_DRIVE = "https://www.googleapis.com/auth/drive";
  static final String SCOPE_CONTACTS = "https://www.googleapis.com/auth/contacts";

  WebView web;
  final Handler main = new Handler(Looper.getMainLooper());
  // Work waiting for an activity result.
  String scanId, authId, accountId, saveId;
  JSONObject authArgs;
  byte[] saveBytes;
  ValueCallback<Uri[]> fileCallback;
  PermissionRequest pendingPermission;
  Intent pendingShare;
  boolean ready;

  @Override
  protected void onCreate(Bundle b) {
    super.onCreate(b);
    clearDir(new File(getCacheDir(), "incoming"));
    WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(244, 246, 249));
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true); // IndexedDB / localStorage hold the records and settings
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setSupportZoom(false);
    web.addJavascriptInterface(new Bridge(), "AndroidNative");
    final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
        .setDomain(HOST)
        .addPathHandler("/www/", new Assets())
        .build();
    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (!HOST.equals(u.getHost())) return null; // Google APIs, Gemini: the network as usual
        String p = u.getPath() == null ? "" : u.getPath();
        // Pictures, PDFs, recordings, handwritten memos: kept as files on the phone.
        if (p.startsWith("/www/media/")) return fileResponse(new File(mediaDir(), safe(p.substring(11))));
        if (p.startsWith("/www/incoming/")) return fileResponse(new File(new File(getCacheDir(), "incoming"), safe(p.substring(14))));
        return assets.shouldInterceptRequest(u);
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        String u = r.getUrl().toString();
        if (u.startsWith("https://" + HOST + "/")) return false;
        openUrl(u);
        return true;
      }

      @Override
      public void onPageFinished(WebView v, String url) {
        ready = true;
        if (pendingShare != null) {
          Intent i = pendingShare;
          pendingShare = null;
          receiveShare(i);
        }
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      // <input type="file"> (pick PDFs and pictures).
      @Override
      public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = cb;
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"application/pdf", "image/*"});
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
        try {
          startActivityForResult(i, FILES);
        } catch (ActivityNotFoundException e) {
          fileCallback = null;
          return false;
        }
        return true;
      }

      // The camera (documents) and the microphone (interview recordings) for our own page.
      @Override
      public void onPermissionRequest(PermissionRequest req) {
        if (!HOST.equals(req.getOrigin().getHost())) {
          req.deny();
          return;
        }
        List<String> need = new ArrayList<>();
        for (String r : req.getResources()) {
          if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !granted(Manifest.permission.CAMERA)) need.add(Manifest.permission.CAMERA);
          if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !granted(Manifest.permission.RECORD_AUDIO)) need.add(Manifest.permission.RECORD_AUDIO);
        }
        if (need.isEmpty()) {
          req.grant(req.getResources());
          return;
        }
        pendingPermission = req;
        requestPermissions(need.toArray(new String[0]), PERMS);
      }
    });
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        if (!ready) {
          finish();
          return;
        }
        // The screen goes back a step; at the list it answers false and the app closes.
        web.evaluateJavascript("window.handleBack ? String(window.handleBack()) : 'false'", r -> {
          if (r == null || r.contains("false")) moveTaskToBack(true);
        });
      }
    });
    setContentView(web);
    web.loadUrl(START);
    if (isShare(getIntent())) pendingShare = getIntent();
  }

  @Override
  protected void onNewIntent(Intent i) {
    super.onNewIntent(i);
    if (isShare(i)) {
      if (ready) receiveShare(i);
      else pendingShare = i;
    }
  }

  // Coming back: catch up with the PC. Leaving: send what changed here.
  @Override
  protected void onResume() {
    super.onResume();
    js("window.Native && Native.call(JSON.stringify({action:'focus'}))");
  }

  @Override
  protected void onPause() {
    js("window.Native && Native.call(JSON.stringify({action:'leave'}))");
    super.onPause();
  }

  boolean granted(String p) {
    return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
    super.onRequestPermissionsResult(code, perms, results);
    if (code != PERMS || pendingPermission == null) return;
    PermissionRequest req = pendingPermission;
    pendingPermission = null;
    List<String> ok = new ArrayList<>();
    for (String r : req.getResources()) {
      if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && granted(Manifest.permission.CAMERA)) ok.add(r);
      if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && granted(Manifest.permission.RECORD_AUDIO)) ok.add(r);
    }
    if (ok.isEmpty()) req.deny();
    else req.grant(ok.toArray(new String[0]));
  }

  // ---- answers to the page ---------------------------------------------------------------
  void js(String code) {
    main.post(() -> {
      if (web != null && ready) web.evaluateJavascript(code, null);
    });
  }

  void reply(String id, JSONObject data) {
    if (id == null) return;
    js("window.AndroidReply && AndroidReply(" + JSONObject.quote(id) + "," + data.toString() + ")");
  }

  void fail(String id, String message) {
    try {
      reply(id, new JSONObject().put("error", message == null ? "エラー" : message));
    } catch (Exception ignored) {
    }
  }

  // ---- files ---------------------------------------------------------------------------
  File mediaDir() {
    File d = new File(getFilesDir(), "media");
    d.mkdirs();
    return d;
  }

  static String safe(String name) {
    if (!name.matches("[A-Za-z0-9_.-]{1,200}") || name.contains("..")) throw new IllegalArgumentException("不正なファイル名");
    return name;
  }

  static String typeOf(String name) {
    String ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase();
    switch (ext) {
      case "js":
      case "mjs":
        return "text/javascript";
      case "json":
        return "application/json";
      case "webmanifest":
        return "application/manifest+json";
      case "webm":
        return "audio/webm";
      case "ogg":
        return "audio/ogg";
      case "m4a":
        return "audio/mp4";
      case "original":
        return "application/octet-stream";
      default:
        String t = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return t == null ? "application/octet-stream" : t;
    }
  }

  WebResourceResponse fileResponse(File f) {
    try {
      if (!f.exists()) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
      return new WebResourceResponse(typeOf(f.getName()), null, new FileInputStream(f));
    } catch (Exception e) {
      return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
    }
  }

  // Our own handler for assets/www: pdf.js is an ES module (.mjs) and needs a JavaScript type.
  class Assets implements WebViewAssetLoader.PathHandler {
    @Override
    public WebResourceResponse handle(String path) {
      try {
        if (path.isEmpty() || path.endsWith("/")) path += "index.html";
        if (path.contains("..")) return null;
        InputStream in = getAssets().open("www/" + path);
        return new WebResourceResponse(typeOf(path), path.matches(".*\\.(html|js|mjs|css|json)$") ? "utf-8" : null, in);
      } catch (Exception e) {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
      }
    }
  }

  static void clearDir(File d) {
    File[] list = d.listFiles();
    if (list != null) for (File f : list) f.delete();
  }

  String displayName(Uri u) {
    try (Cursor c = getContentResolver().query(u, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
      if (c != null && c.moveToFirst()) return c.getString(0);
    } catch (Exception ignored) {
    }
    String s = u.getLastPathSegment();
    return s == null ? "file" : s;
  }

  // A picked or scanned file, copied where the page can fetch it: /incoming/<name>.
  JSONObject incoming(Uri u, String nameHint) throws Exception {
    String shown = nameHint != null ? nameHint : displayName(u);
    String ext = shown.contains(".") ? shown.substring(shown.lastIndexOf('.')).toLowerCase().replaceAll("[^a-z0-9.]", "") : ".jpg";
    String name = UUID.randomUUID() + ext;
    File dir = new File(getCacheDir(), "incoming");
    dir.mkdirs();
    try (InputStream in = getContentResolver().openInputStream(u); OutputStream out = new FileOutputStream(new File(dir, name))) {
      byte[] buf = new byte[65536];
      for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
    }
    return new JSONObject().put("name", shown).put("path", "incoming/" + name);
  }

  static boolean isShare(Intent i) {
    return i != null && (Intent.ACTION_SEND.equals(i.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(i.getAction()));
  }

  // PDFs / pictures shared from Gmail, Files, Drive…: imported like files picked in the app.
  void receiveShare(Intent i) {
    try {
      List<Uri> uris = new ArrayList<>();
      if (Intent.ACTION_SEND.equals(i.getAction())) {
        Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u != null) uris.add(u);
      } else {
        ArrayList<Uri> list = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (list != null) uris.addAll(list);
      }
      JSONArray files = new JSONArray();
      for (Uri u : uris) files.put(incoming(u, null));
      if (files.length() > 0) js("window.AndroidShared && AndroidShared(" + files + ")");
    } catch (Exception e) {
      js("window.onNative && onNative({type:'error',data:" + JSONObject.quote("共有されたファイルを読み込めませんでした：" + e.getMessage()) + "})");
    }
  }

  void openUrl(String u) {
    if (!u.matches("^(https?|tel|mailto):.*")) return;
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
    } catch (Exception ignored) {
    }
  }

  Uri shareUri(String name) throws Exception {
    File f = new File(mediaDir(), safe(name));
    return FileProvider.getUriForFile(this, getPackageName() + ".files", f);
  }

  // ---- Google accounts (Play services) ----------------------------------------------------
  void authorize(String id, JSONObject a, boolean interactive) {
    try {
      List<Scope> scopes = new ArrayList<>();
      if (!"contacts".equals(a.optString("purpose"))) scopes.add(new Scope(SCOPE_DRIVE));
      scopes.add(new Scope(SCOPE_CONTACTS));
      AuthorizationRequest.Builder rb = AuthorizationRequest.builder().setRequestedScopes(scopes);
      String email = a.optString("email");
      if (!email.isEmpty()) rb.setAccount(new Account(email, "com.google"));
      Identity.getAuthorizationClient(this).authorize(rb.build())
          .addOnSuccessListener(r -> {
            if (r.hasResolution()) {
              if (!interactive) {
                try {
                  reply(id, new JSONObject().put("needLogin", true));
                } catch (Exception ignored) {
                }
                return;
              }
              try {
                authId = id;
                authArgs = a;
                startIntentSenderForResult(r.getPendingIntent().getIntentSender(), AUTH, null, 0, 0, 0, null);
              } catch (Exception e) {
                authId = null;
                fail(id, e.getMessage());
              }
            } else token(id, r, email);
          })
          .addOnFailureListener(e -> fail(id, "Googleに接続できませんでした：" + e.getMessage() + "（Google CloudにAndroid用のクライアント〔パッケージ名とSHA-1〕を登録してあるか確認してください）"));
    } catch (Exception e) {
      fail(id, e.getMessage());
    }
  }

  void token(String id, AuthorizationResult r, String email) {
    try {
      if (r.getAccessToken() == null) {
        fail(id, "Googleの許可を取得できませんでした");
        return;
      }
      reply(id, new JSONObject().put("token", r.getAccessToken()).put("email", email));
    } catch (Exception e) {
      fail(id, e.getMessage());
    }
  }

  // ---- results ----------------------------------------------------------------------------
  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    try {
      if (request == FILES) {
        ValueCallback<Uri[]> cb = fileCallback;
        fileCallback = null;
        if (cb == null) return;
        if (result != RESULT_OK || data == null) {
          cb.onReceiveValue(null);
          return;
        }
        List<Uri> out = new ArrayList<>();
        if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) out.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) out.add(data.getData());
        cb.onReceiveValue(out.toArray(new Uri[0]));
      } else if (request == SCAN) {
        String id = scanId;
        scanId = null;
        JSONArray files = new JSONArray();
        if (result == RESULT_OK) {
          GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(data);
          if (scan != null && scan.getPages() != null) {
            int n = 1;
            for (GmsDocumentScanningResult.Page page : scan.getPages()) files.put(incoming(page.getImageUri(), String.format("scan-%02d.jpg", n++)));
          }
        }
        reply(id, new JSONObject().put("files", files));
      } else if (request == ACCOUNT) {
        String id = accountId;
        accountId = null;
        String email = result == RESULT_OK && data != null ? data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME) : null;
        if (email == null) {
          fail(id, "Googleアカウントを選びませんでした");
          return;
        }
        JSONObject a = authArgs != null ? authArgs : new JSONObject();
        a.put("email", email);
        authorize(id, a, true);
      } else if (request == AUTH) {
        String id = authId;
        authId = null;
        if (result != RESULT_OK) {
          fail(id, "Googleの許可を中止しました");
          return;
        }
        AuthorizationResult r = Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data);
        token(id, r, authArgs != null ? authArgs.optString("email") : "");
      } else if (request == SAVE) {
        String id = saveId;
        byte[] bytes = saveBytes;
        saveId = null;
        saveBytes = null;
        if (result != RESULT_OK || data == null || data.getData() == null) {
          reply(id, new JSONObject().put("saved", false));
          return;
        }
        try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
          out.write(bytes);
        }
        reply(id, new JSONObject().put("saved", true));
      }
    } catch (Exception e) {
      String id = request == SCAN ? scanId : request == AUTH || request == ACCOUNT ? authId : saveId;
      js("window.onNative && onNative({type:'error',data:" + JSONObject.quote(String.valueOf(e.getMessage())) + "})");
    }
  }

  // This build's signing certificate: what the Android OAuth client in Google Cloud must name.
  String signingSha1() {
    try {
      android.content.pm.Signature[] sig = Build.VERSION.SDK_INT >= 28
          ? getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES).signingInfo.getApkContentsSigners()
          : getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES).signatures;
      byte[] d = java.security.MessageDigest.getInstance("SHA-1").digest(sig[0].toByteArray());
      StringBuilder b = new StringBuilder();
      for (byte x : d) b.append(b.length() == 0 ? "" : ":").append(String.format("%02X", x));
      return b.toString();
    } catch (Exception e) {
      return "";
    }
  }

  // ---- the bridge -------------------------------------------------------------------------
  class Bridge {
    @JavascriptInterface
    public String info() {
      try {
        return new JSONObject()
            .put("version", getPackageManager().getPackageInfo(getPackageName(), 0).versionName)
            .put("package", getPackageName())
            .put("sha1", signingSha1())
            .toString();
      } catch (Exception e) {
        return "{}";
      }
    }

    // The Gemini key, encrypted with a key in the Android Keystore (never synced or backed up).
    @JavascriptInterface
    public String secretGet() {
      try {
        return SecretBox.get(MainActivity.this);
      } catch (Exception e) {
        return "";
      }
    }

    @JavascriptInterface
    public void secretSet(String v) {
      try {
        SecretBox.save(MainActivity.this, v == null ? "" : v);
      } catch (Exception ignored) {
      }
    }

    @JavascriptInterface
    public boolean hasMedia(String name) {
      try {
        return new File(mediaDir(), safe(name)).exists();
      } catch (Exception e) {
        return false;
      }
    }

    @JavascriptInterface
    public String writeMedia(String name, String base64) {
      try {
        File f = new File(mediaDir(), safe(name));
        File tmp = new File(mediaDir(), "." + name + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
          out.write(Base64.decode(base64, Base64.DEFAULT));
        }
        if (!tmp.renameTo(f)) throw new Exception("保存できませんでした");
        return "";
      } catch (Exception e) {
        return String.valueOf(e.getMessage());
      }
    }

    @JavascriptInterface
    public void call(String method, String json, String id) {
      main.post(() -> {
        try {
          JSONObject a = json == null || json.isEmpty() ? new JSONObject() : new JSONObject(json);
          switch (method) {
            case "scan":
              scan(id, a);
              break;
            case "token":
              if (a.optBoolean("chooser") || (a.optString("email").isEmpty() && a.optBoolean("interactive"))) {
                accountId = id;
                authArgs = a;
                String hint = a.optString("email");
                Intent pick = AccountManager.newChooseAccountIntent(hint.isEmpty() ? null : new Account(hint, "com.google"), null, new String[] {"com.google"}, null, null, null, null);
                startActivityForResult(pick, ACCOUNT);
              } else if (a.optString("email").isEmpty()) reply(id, new JSONObject().put("needLogin", true));
              else authorize(id, a, a.optBoolean("interactive"));
              break;
            case "saveFile": {
              saveId = id;
              saveBytes = a.optString("text").getBytes("UTF-8");
              Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(a.optString("type", "text/csv")).putExtra(Intent.EXTRA_TITLE, a.optString("name"));
              startActivityForResult(i, SAVE);
              break;
            }
            case "openUrl":
              openUrl(a.optString("url"));
              reply(id, new JSONObject());
              break;
            case "openFile": {
              String name = a.optString("name");
              Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(shareUri(name), typeOf(name)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
              startActivity(Intent.createChooser(i, "開く"));
              reply(id, new JSONObject());
              break;
            }
            case "share": {
              String name = a.optString("name");
              Intent i = new Intent(Intent.ACTION_SEND).setType(typeOf(name)).putExtra(Intent.EXTRA_STREAM, shareUri(name)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
              startActivity(Intent.createChooser(i, "共有"));
              reply(id, new JSONObject());
              break;
            }
            case "copyText": {
              android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
              cm.setPrimaryClip(android.content.ClipData.newPlainText("text", a.optString("text")));
              reply(id, new JSONObject());
              break;
            }
            default:
              fail(id, "未対応の操作：" + method);
          }
        } catch (Exception e) {
          fail(id, e.getMessage());
        }
      });
    }
  }

  // Google's document scanner (edges found and straightened; several pages). On a phone without
  // it the page falls back to its own camera.
  void scan(String id, JSONObject a) {
    GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(true)
        .setPageLimit(Math.max(1, Math.min(30, a.optInt("pages", 20))))
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .build();
    GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
    scanner.getStartScanIntent(this)
        .addOnSuccessListener(sender -> {
          try {
            scanId = id;
            startIntentSenderForResult(sender, SCAN, null, 0, 0, 0, null);
          } catch (Exception e) {
            scanId = null;
            unavailable(id);
          }
        })
        .addOnFailureListener(e -> unavailable(id));
  }

  void unavailable(String id) {
    try {
      reply(id, new JSONObject().put("unavailable", true));
    } catch (Exception ignored) {
    }
  }
}
