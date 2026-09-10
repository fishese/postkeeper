package cc.fishese.postkeeper;

import android.annotation.SuppressLint;
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
  private static final int MAX_IMAGE_CANDIDATES = 24;
  private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  private static final long IMAGE_CAPTURE_DEADLINE_MS = 90_000;
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
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      getOnBackInvokedDispatcher()
          .registerOnBackInvokedCallback(
              android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
    startingUrl = getIntent().getStringExtra("url");
    if (!SafeUrls.captureAllowed(startingUrl, BuildConfig.DEBUG)
        || !WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
        || !WebViewFeature.isFeatureSupported(WebViewFeature.DELETE_BROWSING_DATA)) {
      finish();
      return;
    }
    setContentView(R.layout.capture_activity);
    LinearLayout layout = findViewById(R.id.capture_root);
    layout.setOnApplyWindowInsetsListener(
        (view, insets) -> {
          view.setPadding(
              insets.getSystemWindowInsetLeft(),
              insets.getSystemWindowInsetTop(),
              insets.getSystemWindowInsetRight(),
              insets.getSystemWindowInsetBottom());
          return insets;
        });
    location = findViewById(R.id.capture_location);
    location.setOnClickListener(
        v ->
            new AlertDialog.Builder(this)
                .setTitle(R.string.show_full_address)
                .setMessage(location.getText())
                .setPositiveButton(android.R.string.ok, null)
                .show());
    status = findViewById(R.id.capture_status);
    save = findViewById(R.id.capture_save);
    save.setEnabled(false);
    save.setOnClickListener(v -> capture(false));
    findViewById(R.id.capture_library).setOnClickListener(v -> finish());
    findViewById(R.id.capture_menu)
        .setOnClickListener(
            v -> {
              PopupMenu menu = new PopupMenu(this, v);
              menu.getMenu()
                  .add(0, 1, 0, R.string.back_page)
                  .setEnabled(web.canGoBack() && !capturing);
              menu.getMenu().add(0, 2, 1, R.string.clear_this_site).setEnabled(!capturing);
              menu.getMenu().add(0, 3, 2, R.string.clear_all_browsing_data).setEnabled(!capturing);
              menu.getMenu().add(0, 4, 3, R.string.save_full_page).setEnabled(!capturing && save.isEnabled());
              menu.setOnMenuItemClickListener(
                  item -> {
                    if (item.getItemId() == 1) {
                      if (!capturing && web.canGoBack()) web.goBack();
                    } else if (item.getItemId() == 4) capture(true);
                    else confirmClear(item.getItemId() == 3);
                    return true;
                  });
              menu.show();
            });
    web = findViewById(R.id.capture_web);
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
              status.setText(
                  getString(R.string.native_blocked_unsupported_url_use_https_to_browse));
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
                getString(
                    url.startsWith("https:") ? R.string.https_address : R.string.local_address,
                    url));
            save.setEnabled(false);
          }

          @Override
          public void onPageFinished(WebView view, String url) {
            location.setText(
                getString(
                    url.startsWith("https:") ? R.string.https_address : R.string.local_address,
                    url));
            save.setEnabled(!capturing && SafeUrls.captureAllowed(url, BuildConfig.DEBUG));
          }

          @Override
          public void onReceivedSslError(
              WebView view, SslErrorHandler handler, android.net.http.SslError error) {
            handler.cancel();
            save.setEnabled(false);
            status.setText(getString(R.string.native_tls_certificate_error_this_page_cannot_be));
          }
        });
    web.loadUrl(startingUrl);
  }

  private void confirmClear(boolean all) {
    if (capturing) return;
    new AlertDialog.Builder(this)
        .setTitle(getString(R.string.native_clear_capture_browsing_data))
        .setMessage(
            all
                ? getString(R.string.native_remove_every_capture_browser_session_including_cookies)
                : getString(R.string.clear_site_message, SafeUrls.origin(startingUrl)))
        .setPositiveButton(getString(R.string.native_clear), (d, w) -> clear(all))
        .setNegativeButton(getString(R.string.native_cancel), null)
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
      status.setText(getString(R.string.native_browsing_data_cleared_your_saved_library_is));
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

  private void capture(boolean fullPage) {
    if (capturing) return;
    final String pageUrl = web.getUrl();
    if (!SafeUrls.captureAllowed(pageUrl, BuildConfig.DEBUG)) return;
    capturing = true;
    save.setEnabled(false);
    status.setText(getString(R.string.native_saving_this_page_and_available_images));
    try {
      String script =
          new String(
              readBounded(getAssets().open(fullPage ? "capture-full.js" : "capture.js"), 1_000_000), StandardCharsets.UTF_8);
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
      int candidateCount = Math.min(urls.length(), MAX_IMAGE_CANDIDATES);
      long deadline = android.os.SystemClock.elapsedRealtime() + IMAGE_CAPTURE_DEADLINE_MS;
      for (int i = 0; i < candidateCount; i++) {
        if (total >= MAX_IMAGE_BYTES
            || android.os.SystemClock.elapsedRealtime() >= deadline) {
          warnings.put("native-image-unavailable");
          break;
        }
        final int progress = i + 1;
        runOnUiThread(
            () -> {
              if (capturing)
                status.setText(
                    getString(R.string.native_saving_image_progress, progress, candidateCount));
            });
        String url = urls.getString(i);
        // Public CDN images need no site-session access. Never read other origins' cookies.
        if (!SafeUrls.captureAllowed(url, BuildConfig.DEBUG)) {
          warnings.put("native-cross-origin-image");
          continue;
        }
        try {
          HttpURLConnection connection = openImage(url, agent, cookies);
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
                      MAX_IMAGE_BYTES - total);
            } catch (IOException limitOrReadFailure) {
              warnings.put("native-image-unavailable");
              continue;
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
      runOnUiThread(
          () -> {
            if (!isFinishing()) failed();
          });
    } finally {
      cookies.clear();
    }
  }

  private void failed() {
    capturing = false;
    save.setEnabled(true);
    status.setText(getString(R.string.native_capture_failed_or_exceeded_its_limit_your));
  }

  static HttpURLConnection openImage(String source, String agent, Map<String, String> cookies)
      throws IOException {
    String current = source;
    for (int hop = 0; hop <= 5; hop++) {
      if (!SafeUrls.captureAllowed(current, BuildConfig.DEBUG)) throw new IOException();
      HttpURLConnection connection = (HttpURLConnection) new URL(current).openConnection();
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(5000);
      connection.setReadTimeout(5000);
      connection.setRequestProperty("User-Agent", agent);
      // Cookies were read for exact same-origin candidates on the UI thread only.
      String cookie = cookies.get(current);
      if (cookie != null) connection.setRequestProperty("Cookie", cookie);
      try {
        int code = connection.getResponseCode();
        if (code != 301 && code != 302 && code != 303 && code != 307 && code != 308)
          return connection;
        String next = connection.getHeaderField("Location");
        if (next == null) throw new IOException();
        current = new URL(new URL(current), next).toString();
      } catch (IOException e) {
        connection.disconnect();
        throw e;
      }
      connection.disconnect();
    }
    throw new IOException("Too many image redirects");
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

  private void handleBack() {
    capturing = false;
    if (web != null) web.stopLoading();
    setResult(RESULT_CANCELED);
    finish();
  }

  @Override
  @SuppressLint("GestureBackNavigation")
  @SuppressWarnings("deprecation")
  public void onBackPressed() {
    handleBack();
  }

  @Override
  protected void onDestroy() {
    if (web != null) web.destroy();
    worker.shutdownNow();
    super.onDestroy();
  }
}
