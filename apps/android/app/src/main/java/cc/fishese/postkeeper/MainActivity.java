package cc.fishese.postkeeper;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import org.json.*;

public class MainActivity extends Activity {
  private static final String HOME = SafeUrls.APP_ORIGIN + "/assets/web/index.html";
  private WebView web;
  private JavaScriptReplyProxy captureReply;
  private int captureRequestId;
  private String captureText, captureId;
  private ValueCallback<Uri[]> fileCallback;
  private JavaScriptReplyProxy exportReply;
  private int exportRequestId;
  private ByteArrayOutputStream exportBytes;
  private WebView printView;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
        || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        || !WebViewFeature.isFeatureSupported(WebViewFeature.DELETE_BROWSING_DATA)) {
      TextView error = new TextView(this);
      error.setText(
          "Update Android System WebView to use PostKeeper. Isolated profiles and origin-restricted"
              + " messaging are required.");
      setContentView(error);
      return;
    }
    acceptShare(getIntent());
    web = new WebView(this);
    WebViewCompat.setProfile(web, "postkeeper-library");
    if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.getSettings().setSupportMultipleWindows(true);
    WebViewAssetLoader assets =
        new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            WebResourceResponse local = assets.shouldInterceptRequest(request.getUrl());
            // Never fall through to network on the privileged application origin.
            if (local == null && "appassets.androidplatform.net".equals(request.getUrl().getHost()))
              return new WebResourceResponse(
                  "text/plain",
                  "utf-8",
                  404,
                  "Not found",
                  null,
                  new ByteArrayInputStream(new byte[0]));
            return local;
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (trustedDocument(request.getUrl())) return false;
            if (request.isForMainFrame()) openExternal(request.getUrl());
            return true;
          }

          @Override
          public void onReceivedSslError(
              WebView view, SslErrorHandler handler, android.net.http.SslError error) {
            handler.cancel();
          }
        });
    web.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public boolean onShowFileChooser(
              WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent intent =
                new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(intent, 12);
            return true;
          }

          @Override
          public boolean onCreateWindow(
              WebView view, boolean dialog, boolean gesture, Message result) {
            // Deliberate target=_blank links open externally, never in the privileged WebView.
            if (!gesture) return false;
            WebView transientView = new WebView(MainActivity.this);
            transientView.setWebViewClient(
                new WebViewClient() {
                  @Override
                  public boolean shouldOverrideUrlLoading(
                      WebView view, WebResourceRequest request) {
                    openExternal(request.getUrl());
                    view.destroy();
                    return true;
                  }
                });
            ((WebView.WebViewTransport) result.obj).setWebView(transientView);
            result.sendToTarget();
            return true;
          }

          @Override
          public void onPermissionRequest(PermissionRequest request) {
            request.deny();
          }
        });
    WebViewCompat.addWebMessageListener(
        web,
        "PostKeeperNative",
        Collections.singleton(SafeUrls.APP_ORIGIN),
        (view, message, origin, mainFrame, reply) -> {
          if (!mainFrame
              || !origin.toString().equals(SafeUrls.APP_ORIGIN)
              || !trustedDocument(Uri.parse(view.getUrl()))) return;
          try {
            String text = message.getData();
            if (text == null || text.length() > 4_000_000) throw new IllegalArgumentException();
            JSONObject request = new JSONObject(text);
            dispatch(
                request.getInt("id"),
                request.getString("action"),
                request.optJSONObject("data"),
                reply);
          } catch (Exception ignored) {
            /* Malformed or untrusted commands have no side effects. */
          }
        });
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    // Respect system bars on edge-to-edge Android releases.
    layout.setOnApplyWindowInsetsListener(
        (view, insets) -> {
          view.setPadding(
              insets.getSystemWindowInsetLeft(),
              insets.getSystemWindowInsetTop(),
              insets.getSystemWindowInsetRight(),
              insets.getSystemWindowInsetBottom());
          return insets;
        });
    layout.addView(web, new LinearLayout.LayoutParams(-1, -1));
    setContentView(layout);
    web.loadUrl(HOME);
  }

  static boolean trustedDocument(Uri url) {
    return url != null
        && url.getScheme() != null
        && url.getScheme().equals("https")
        && "appassets.androidplatform.net".equals(url.getHost())
        && (url.getPort() == -1 || url.getPort() == 443)
        && url.getUserInfo() == null
        && ("/assets/web/index.html".equals(url.getPath()) || "/assets/web/".equals(url.getPath()));
  }

  private void openExternal(Uri uri) {
    if (SafeUrls.APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())
        && uri.getPort() == -1
        && uri.getUserInfo() == null
        && Arrays.asList(
                "/assets/web/privacy.html",
                "/assets/web/terms.html",
                "/assets/web/THIRD_PARTY_NOTICES.txt")
            .contains(uri.getPath())) {
      WebView document = new WebView(this);
      document.getSettings().setJavaScriptEnabled(false);
      document.getSettings().setAllowFileAccess(false);
      document.getSettings().setAllowContentAccess(false);
      document.getSettings().setBlockNetworkLoads(true);
      WebViewAssetLoader assets =
          new WebViewAssetLoader.Builder()
              .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
              .build();
      document.setWebViewClient(
          new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                WebView view, WebResourceRequest request) {
              WebResourceResponse local = assets.shouldInterceptRequest(request.getUrl());
              return local != null
                  ? local
                  : new WebResourceResponse(
                      "text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
              if (request.getUrl().toString().startsWith(uri.toString() + "#")) return false;
              openExternal(request.getUrl());
              return true;
            }
          });
      AlertDialog dialog =
          new AlertDialog.Builder(this).setView(document).setPositiveButton("Close", null).create();
      dialog.setOnDismissListener(d -> document.destroy());
      document.loadUrl(uri.toString());
      dialog.show();
      dialog.getWindow().setLayout(-1, -1);
      return;
    }
    try {
      SafeUrls.origin(uri.toString());
      startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
    } catch (Exception ignored) {
      Toast.makeText(this, "Only HTTP and HTTPS links can be opened.", Toast.LENGTH_SHORT).show();
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    acceptShare(intent);
    if (web != null)
      web.evaluateJavascript("window.dispatchEvent(new Event('postkeeper-native-share'))", null);
  }

  private void acceptShare(Intent intent) {
    if (!Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType()))
      return;
    try {
      CharSequence content = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
      String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
      if (content == null || content.length() > 16384 || (title != null && title.length() > 512))
        throw new IllegalArgumentException();
      java.util.regex.Matcher link =
          java.util.regex.Pattern.compile(
                  "https?://[^\\s<>\"']+", java.util.regex.Pattern.CASE_INSENSITIVE)
              .matcher(content);
      if (!link.find() || link.group().length() > 8192) throw new IllegalArgumentException();
      SafeUrls.origin(link.group());
      JSONArray queue = shareQueue();
      if (queue.length() >= 20) throw new IllegalStateException();
      queue.put(
          new JSONObject()
              .put("id", UUID.randomUUID().toString())
              .put("text", content.toString())
              .put("title", title == null ? "" : title));
      if (!getSharedPreferences("pending-shares", MODE_PRIVATE)
          .edit()
          .putString("queue", queue.toString())
          .commit()) throw new IOException();
      intent.setAction(null); // Do not enqueue again during Activity recreation.
    } catch (Exception ignored) {
      Toast.makeText(
              this,
              "Unable to queue share. Share one short URL after opening PostKeeper.",
              Toast.LENGTH_LONG)
          .show();
    }
  }

  private JSONArray shareQueue() throws JSONException {
    return new JSONArray(
        getSharedPreferences("pending-shares", MODE_PRIVATE).getString("queue", "[]"));
  }

  private void reply(JavaScriptReplyProxy port, int id, Object result, String error) {
    try {
      JSONObject message = new JSONObject().put("id", id);
      if (error != null) message.put("error", error);
      else message.put("result", result == null ? JSONObject.NULL : result);
      port.postMessage(message.toString());
    } catch (Exception ignored) {
    }
  }

  private void confirm(String message, Runnable yes, Runnable cancel) {
    new AlertDialog.Builder(this)
        .setTitle("PostKeeper")
        .setMessage(message)
        .setPositiveButton("Continue", (d, w) -> yes.run())
        .setNegativeButton("Cancel", (d, w) -> cancel.run())
        .setOnCancelListener(d -> cancel.run())
        .show();
  }

  private void dispatch(int id, String action, JSONObject data, JavaScriptReplyProxy port) {
    try {
      switch (action) {
        case "sharedLink":
          reply(port, id, shareQueue().optJSONObject(0), null);
          break;
        case "ackShare":
          {
            JSONArray queue = shareQueue();
            if (queue.length() == 0
                || !queue.getJSONObject(0).getString("id").equals(data.getString("id")))
              throw new IllegalArgumentException();
            queue.remove(0);
            if (!getSharedPreferences("pending-shares", MODE_PRIVATE)
                .edit()
                .putString("queue", queue.toString())
                .commit()) throw new IOException();
            reply(port, id, true, null);
            if (queue.length() > 0)
              web.postDelayed(
                  () ->
                      web.evaluateJavascript(
                          "window.dispatchEvent(new Event('postkeeper-native-share'))", null),
                  100);
            break;
          }
        case "capture":
          {
            if (captureReply != null) throw new IllegalStateException();
            String url = data.getString("url");
            if (!SafeUrls.captureAllowed(url, BuildConfig.DEBUG))
              throw new IllegalArgumentException(
                  "Capture requires HTTPS (debug builds also allow local fixtures).");
            captureReply = port;
            captureRequestId = id;
            startActivityForResult(
                new Intent(this, CaptureActivity.class).putExtra("url", url), 11);
            break;
          }
        case "captureChunk":
          {
            if (captureText == null || !Objects.equals(captureId, data.getString("id")))
              throw new IllegalArgumentException();
            int offset = data.getInt("offset");
            if (offset < 0 || offset >= captureText.length() || offset % (48 * 1024) != 0)
              throw new IllegalArgumentException();
            reply(
                port,
                id,
                captureText.substring(offset, Math.min(offset + 48 * 1024, captureText.length())),
                null);
            break;
          }
        case "ackCapture":
          if (!Objects.equals(captureId, data.getString("id")))
            throw new IllegalArgumentException();
          captureText = null;
          captureId = null;
          reply(port, id, true, null);
          break;
        case "saveKey":
        case "loadKey":
        case "forgetKey":
          {
            confirm(
                action.equals("saveKey")
                    ? "Store this recovery key encrypted on this device? Keep a separate recovery"
                          + " copy. This replaces any device convenience copy."
                    : action.equals("loadKey")
                        ? "Load the saved recovery key into this app session?"
                        : "Remove only this device's saved recovery-key copy? Your library"
                              + " remains.",
                () -> {
                  try {
                    KeyVault vault = new KeyVault(this);
                    Object value = true;
                    if (action.equals("saveKey")) vault.save(data.getString("key"));
                    else if (action.equals("loadKey")) value = vault.load();
                    else vault.clear();
                    reply(port, id, value, null);
                  } catch (Exception e) {
                    reply(
                        port,
                        id,
                        null,
                        "The device key action failed. Your separate recovery copy is still"
                            + " needed.");
                  }
                },
                () -> reply(port, id, null, "Cancelled."));
            break;
          }
        case "exportStart":
          if (exportReply != null) throw new IllegalStateException();
          exportBytes = new ByteArrayOutputStream();
          reply(port, id, true, null);
          break;
        case "exportChunk":
          {
            String chunk = data.getString("text");
            if (exportBytes == null
                || chunk.length() > 48 * 1024
                || exportBytes.size() + chunk.getBytes(StandardCharsets.UTF_8).length
                    > 128 * 1024 * 1024) throw new IllegalArgumentException();
            exportBytes.write(chunk.getBytes(StandardCharsets.UTF_8));
            reply(port, id, true, null);
            break;
          }
        case "exportSave":
          {
            if (exportBytes == null || exportReply != null) throw new IllegalStateException();
            String name = data.getString("name");
            if (!name.matches("postkeeper-[a-z0-9.-]+\\.json"))
              throw new IllegalArgumentException();
            exportReply = port;
            exportRequestId = id;
            startActivityForResult(
                new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .putExtra(Intent.EXTRA_TITLE, name),
                13);
            break;
          }
        case "print":
          {
            String html = data.getString("html");
            if (html.length() > 3_500_000)
              throw new IllegalArgumentException(
                  "Printable content is too large for this Android preview.");
            if (printView != null) printView.destroy();
            printView = new WebView(this);
            printView.getSettings().setJavaScriptEnabled(false);
            printView.getSettings().setAllowFileAccess(false);
            printView.getSettings().setAllowContentAccess(false);
            printView.getSettings().setBlockNetworkLoads(true);
            printView.setWebViewClient(
                new WebViewClient() {
                  @Override
                  public void onPageFinished(WebView view, String url) {
                    ((android.print.PrintManager) getSystemService(PRINT_SERVICE))
                        .print(
                            "PostKeeper article",
                            view.createPrintDocumentAdapter("PostKeeper article"),
                            new android.print.PrintAttributes.Builder().build());
                    reply(port, id, true, null);
                  }
                });
            printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            break;
          }
        default:
          reply(port, id, null, "Unsupported Android action.");
      }
    } catch (Exception e) {
      reply(
          port,
          id,
          null,
          e instanceof IllegalArgumentException && e.getMessage() != null
              ? e.getMessage()
              : "Android action failed. Retry without changing your library.");
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent intent) {
    super.onActivityResult(request, result, intent);
    if (request == 11 && captureReply != null) {
      try {
        if (result != RESULT_OK || intent == null)
          reply(captureReply, captureRequestId, null, null);
        else {
          String token = intent.getStringExtra("captureId");
          if (token == null || !token.matches("[a-f0-9-]{36}")) throw new IOException();
          File file = new File(getCacheDir(), "capture-" + token + ".json");
          if (file.length() <= 0 || file.length() > 20 * 1024 * 1024) throw new IOException();
          captureText = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
          file.delete();
          captureId = token;
          reply(
              captureReply,
              captureRequestId,
              new JSONObject().put("id", token).put("length", captureText.length()),
              null);
        }
      } catch (Exception e) {
        reply(
            captureReply,
            captureRequestId,
            null,
            "Capture result was unavailable. The pending link is preserved.");
      } finally {
        captureReply = null;
      }
    } else if (request == 12 && fileCallback != null) {
      fileCallback.onReceiveValue(
          result == RESULT_OK && intent != null ? new Uri[] {intent.getData()} : null);
      fileCallback = null;
    } else if (request == 13 && exportReply != null) {
      try {
        if (result != RESULT_OK || intent == null) throw new IOException();
        try (OutputStream out = getContentResolver().openOutputStream(intent.getData())) {
          exportBytes.writeTo(out);
        }
        reply(exportReply, exportRequestId, true, null);
      } catch (Exception e) {
        reply(exportReply, exportRequestId, null, "Export cancelled or could not be saved.");
      } finally {
        exportReply = null;
        exportBytes = null;
      }
    }
  }

  @Override
  protected void onDestroy() {
    if (web != null) web.destroy();
    if (printView != null) printView.destroy();
    super.onDestroy();
  }
}
