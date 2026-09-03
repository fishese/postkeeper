package cc.fishese.postkeeper;

import android.app.*;
import android.content.*;
import android.os.*;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class CaptureActivity extends Activity {
  private WebView web;
  private TextView location, status;
  private Button save;
  private Profile profile;
  private String startingUrl;
  private boolean capturing = false;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    startingUrl = getIntent().getStringExtra("url");
    if (!SafeUrls.captureAllowed(startingUrl, BuildConfig.DEBUG)
        || !WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
        || !WebViewFeature.isFeatureSupported(WebViewFeature.DELETE_BROWSING_DATA)) {
      finish();
      return;
    }
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    layout.setOnApplyWindowInsetsListener(
        (view, insets) -> {
          view.setPadding(
              insets.getSystemWindowInsetLeft(),
              insets.getSystemWindowInsetTop(),
              insets.getSystemWindowInsetRight(),
              insets.getSystemWindowInsetBottom());
          return insets;
        });
    location = new TextView(this);
    location.setTextIsSelectable(true);
    layout.addView(location);
    status = new TextView(this);
    status.setText(
        "Sign in on the website if needed, then select Save page. This browser has a separate site"
            + " session.");
    layout.addView(status);
    LinearLayout controls = new LinearLayout(this);
    save = new Button(this);
    save.setText("Save page");
    save.setEnabled(false);
    save.setOnClickListener(v -> capture());
    controls.addView(save);
    Button back = new Button(this);
    back.setText("Library");
    back.setOnClickListener(v -> finish());
    controls.addView(back);
    Button previous = new Button(this);
    previous.setText("Back page");
    previous.setOnClickListener(
        v -> {
          if (web.canGoBack() && !capturing) web.goBack();
        });
    controls.addView(previous);
    layout.addView(controls);
    LinearLayout clearControls = new LinearLayout(this);
    Button clearSite = new Button(this);
    clearSite.setText("Clear this site");
    clearSite.setOnClickListener(v -> confirmClear(false));
    clearControls.addView(clearSite);
    Button clearAll = new Button(this);
    clearAll.setText("Clear all browsing data");
    clearAll.setOnClickListener(v -> confirmClear(true));
    clearControls.addView(clearAll);
    layout.addView(clearControls);
    web = new WebView(this);
    WebViewCompat.setProfile(web, SafeUrls.profile(startingUrl));
    profile = WebViewCompat.getProfile(web);
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.getSettings().setSaveFormData(false);
    web.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
    // Deliberately no JavaScriptInterface or WebMessageListener in this WebView.
    web.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public void onPermissionRequest(PermissionRequest request) {
            request.deny();
          }
        });
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!SafeUrls.captureAllowed(request.getUrl().toString(), BuildConfig.DEBUG)) {
              status.setText("Blocked unsupported URL. Use HTTPS to browse.");
              return true;
            }
            return false;
          }

          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (url.startsWith(SafeUrls.APP_ORIGIN)
                || (!SafeUrls.captureAllowed(url, BuildConfig.DEBUG)
                    && !url.startsWith("data:")
                    && !url.startsWith("blob:")))
              return new WebResourceResponse(
                  "text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            return null;
          }

          @Override
          public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            location.setText(
                (url.startsWith("https:") ? "HTTPS · " : "Unencrypted local test · ") + url);
            save.setEnabled(false);
          }

          @Override
          public void onPageFinished(WebView view, String url) {
            location.setText(
                (url.startsWith("https:") ? "HTTPS · " : "Unencrypted local test · ") + url);
            save.setEnabled(!capturing && SafeUrls.captureAllowed(url, BuildConfig.DEBUG));
          }

          @Override
          public void onReceivedSslError(
              WebView view, SslErrorHandler handler, android.net.http.SslError error) {
            handler.cancel();
            save.setEnabled(false);
            status.setText("TLS certificate error. This page cannot be opened or captured.");
          }
        });
    layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
    setContentView(layout);
    web.loadUrl(startingUrl);
  }

  private void confirmClear(boolean all) {
    if (capturing) return;
    new AlertDialog.Builder(this)
        .setTitle("Clear capture browsing data?")
        .setMessage(
            all
                ? "Remove every capture-browser session, including cookies and website storage?"
                    + " Your saved library and device key remain."
                : "Remove the session for "
                    + SafeUrls.origin(startingUrl)
                    + ", including sign-in redirects? Your saved library and device key remain.")
        .setPositiveButton("Clear", (d, w) -> clear(all))
        .setNegativeButton("Cancel", null)
        .show();
  }

  private void clear(boolean all) {
    web.stopLoading();
    save.setEnabled(false);
    web.loadUrl("about:blank");
    List<String> names = new ArrayList<>();
    if (all) {
      for (String name : ProfileStore.getInstance().getAllProfileNames())
        if (name.matches("capture-[a-f0-9]{64}")) names.add(name);
    } else names.add(profile.getName());
    clearNext(names, 0);
  }

  private void clearNext(List<String> names, int index) {
    if (index >= names.size()) {
      status.setText("Browsing data cleared. Your saved library is unchanged.");
      web.loadUrl(startingUrl);
      return;
    }
    Profile item = ProfileStore.getInstance().getProfile(names.get(index));
    if (item == null) {
      clearNext(names, index + 1);
      return;
    }
    WebStorageCompat.deleteBrowsingData(
        item.getWebStorage(), getMainExecutor(), () -> clearNext(names, index + 1));
  }

  private void capture() {
    if (capturing) return;
    final String pageUrl = web.getUrl();
    if (!SafeUrls.captureAllowed(pageUrl, BuildConfig.DEBUG)) return;
    capturing = true;
    save.setEnabled(false);
    status.setText("Saving this page and available images…");
    try {
      String script =
          new String(
              readBounded(getAssets().open("capture.js"), 1_000_000), StandardCharsets.UTF_8);
      web.evaluateJavascript(
          script,
          result -> {
            try {
              if (!Objects.equals(pageUrl, web.getUrl())) throw new IOException();
              if (result == null || result.length() > 20 * 1024 * 1024) throw new IOException();
              Object decoded = new JSONTokener(result).nextValue();
              if (!(decoded instanceof String)) throw new IOException();
              JSONObject draft = new JSONObject((String) decoded);
              if (draft.getString("renderedDom").length() > 2_000_000
                  || draft.getString("extractedReaderHtml").length() > 2_000_000)
                throw new IOException();
              // Cookie reads belong only to this profile and same-origin image requests.
              Map<String, String> cookies = new HashMap<>();
              JSONArray urls = draft.getJSONArray("assetUrls");
              for (int i = 0; i < Math.min(urls.length(), 128); i++) {
                String url = urls.getString(i);
                if (SafeUrls.captureAllowed(url, BuildConfig.DEBUG)
                    && SafeUrls.origin(url).equals(SafeUrls.origin(pageUrl)))
                  cookies.put(url, profile.getCookieManager().getCookie(url));
              }
              String agent = web.getSettings().getUserAgentString();
              worker.execute(() -> finishCapture(draft, pageUrl, agent, cookies));
            } catch (Exception ignored) {
              failed();
            }
          });
    } catch (Exception ignored) {
      failed();
    }
  }

  private void finishCapture(
      JSONObject draft, String pageUrl, String agent, Map<String, String> cookies) {
    try {
      JSONArray assets = new JSONArray(),
          warnings = draft.getJSONArray("warnings"),
          urls = draft.getJSONArray("assetUrls");
      int total = 0;
      for (int i = 0; i < Math.min(urls.length(), 128); i++) {
        if (total >= 10 * 1024 * 1024) {
          warnings.put("native-image-unavailable");
          break;
        }
        String url = urls.getString(i);
        // Cross-origin images stay visibly partial rather than accessing unrelated site sessions.
        if (!cookies.containsKey(url)) {
          warnings.put("native-cross-origin-image");
          continue;
        }
        try {
          HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
          connection.setInstanceFollowRedirects(false);
          connection.setConnectTimeout(10000);
          connection.setReadTimeout(10000);
          connection.setRequestProperty("User-Agent", agent);
          String cookie = cookies.get(url);
          if (cookie != null) connection.setRequestProperty("Cookie", cookie);
          try {
            if (connection.getResponseCode() != 200) throw new IOException();
            String type = connection.getContentType().split(";")[0].trim().toLowerCase(Locale.ROOT);
            if (!Arrays.asList(
                    "image/png",
                    "image/jpeg",
                    "image/gif",
                    "image/webp",
                    "image/avif",
                    "image/svg+xml")
                .contains(type)) throw new IOException();
            byte[] bytes;
            try {
              bytes =
                  readBounded(
                      connection.getInputStream(),
                      Math.min(5 * 1024 * 1024, 10 * 1024 * 1024 - total));
            } catch (IOException limitOrReadFailure) {
              // Do not keep downloading after a failed/oversized body consumed the image budget.
              warnings.put("native-image-unavailable");
              break;
            }
            total += bytes.length;
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hash = new StringBuilder();
            for (byte b : digest) hash.append(String.format("%02x", b & 255));
            assets.put(
                new JSONObject()
                    .put("assetId", "image-" + i)
                    .put("sourceUrl", url)
                    .put("mediaType", type)
                    .put("byteLength", bytes.length)
                    .put("sha256", hash.toString())
                    .put(
                        "base64",
                        android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)));
          } finally {
            connection.disconnect();
          }
        } catch (Exception ignored) {
          warnings.put("native-image-unavailable");
        }
      }
      String token = UUID.randomUUID().toString();
      // The actual WebView URL is authoritative; canonical metadata is untrusted like all capture
      // fields.
      String canonical = draft.optString("canonicalUrl", pageUrl);
      if (!SafeUrls.captureAllowed(canonical, BuildConfig.DEBUG)) canonical = pageUrl;
      JSONObject packet =
          new JSONObject()
              .put("formatVersion", 1)
              .put("captureId", token)
              .put("capturedAt", java.time.Instant.now().toString())
              .put("captureMethod", "android-capture-browser")
              .put("sourceBrowser", agent)
              .put("originalUrl", pageUrl)
              .put("canonicalUrl", canonical)
              .put("metadata", draft.getJSONObject("metadata"))
              .put("renderedDom", draft.getString("renderedDom"))
              .put("extractedReaderHtml", draft.getString("extractedReaderHtml"))
              .put("assets", assets)
              .put("warnings", warnings);
      byte[] encoded = packet.toString().getBytes(StandardCharsets.UTF_8);
      if (encoded.length > 20 * 1024 * 1024) throw new IOException();
      File file = new File(getCacheDir(), "capture-" + token + ".json");
      try (FileOutputStream output = new FileOutputStream(file)) {
        output.write(encoded);
      }
      runOnUiThread(
          () -> {
            if (isFinishing()) {
              file.delete();
              return;
            }
            setResult(RESULT_OK, new Intent().putExtra("captureId", token));
            finish();
          });
    } catch (Exception ignored) {
      runOnUiThread(this::failed);
    } finally {
      cookies.clear();
    }
  }

  private void failed() {
    capturing = false;
    save.setEnabled(true);
    status.setText(
        "Capture failed or exceeded its limit. Your pending link remains. Retry when the page"
            + " finishes loading.");
  }

  static byte[] readBounded(InputStream stream, int limit) throws IOException {
    try (InputStream input = stream;
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[16384];
      int count;
      while ((count = input.read(buffer)) != -1) {
        if (out.size() + count > limit) throw new IOException("Size limit");
        out.write(buffer, 0, count);
      }
      return out.toByteArray();
    }
  }

  @Override
  protected void onDestroy() {
    if (web != null) web.destroy();
    worker.shutdownNow();
    super.onDestroy();
  }
}
