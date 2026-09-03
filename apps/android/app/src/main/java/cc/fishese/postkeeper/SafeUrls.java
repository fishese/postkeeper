package cc.fishese.postkeeper;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class SafeUrls {
  static final String APP_ORIGIN = "https://appassets.androidplatform.net";

  static String origin(String value) {
    try {
      URI uri = new URI(value);
      if (uri.getHost() == null || uri.getRawUserInfo() != null)
        throw new IllegalArgumentException();
      String scheme = uri.getScheme().toLowerCase(java.util.Locale.ROOT);
      if (!scheme.equals("https") && !scheme.equals("http")) throw new IllegalArgumentException();
      int port = uri.getPort();
      return scheme
          + "://"
          + uri.getHost().toLowerCase(java.util.Locale.ROOT)
          + (port == -1
                  || (scheme.equals("https") && port == 443)
                  || (scheme.equals("http") && port == 80)
              ? ""
              : ":" + port);
    } catch (Exception e) {
      throw new IllegalArgumentException("Use an HTTP or HTTPS URL without credentials.");
    }
  }

  static boolean captureAllowed(String url, boolean debug) {
    try {
      if (url == null || url.length() > 8192) return false;
      String origin = origin(url);
      String host = new URI(url).getHost();
      if (host.equalsIgnoreCase("appassets.androidplatform.net")) return false;
      return origin.startsWith("https://")
          || (debug
              && (host.equals("127.0.0.1") || host.equals("localhost") || host.equals("10.0.2.2")));
    } catch (Exception e) {
      return false;
    }
  }

  static String profile(String url) {
    try {
      byte[] bytes =
          MessageDigest.getInstance("SHA-256").digest(origin(url).getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder("capture-");
      for (byte b : bytes) hex.append(String.format("%02x", b & 255));
      return hex.toString();
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid site.");
    }
  }
}
