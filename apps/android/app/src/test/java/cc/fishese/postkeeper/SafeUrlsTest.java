package cc.fishese.postkeeper;

import static org.junit.Assert.*;

import org.junit.Test;

public class SafeUrlsTest {
  @Test
  public void captureRejectsPrivilegedAndCredentialUrls() {
    for (String value :
        new String[] {
          "javascript:alert(1)",
          "file:///sdcard/test",
          "content://provider/item",
          "https://user:password@example.com",
          "https://appassets.androidplatform.net/assets/web/"
        }) assertFalse(SafeUrls.captureAllowed(value, true));
    assertFalse(SafeUrls.captureAllowed("http://example.com", true));
    assertFalse(SafeUrls.captureAllowed("http://127.0.0.1:4186", false));
    assertTrue(SafeUrls.captureAllowed("http://127.0.0.1:4186", true));
    assertTrue(SafeUrls.captureAllowed("https://example.com/page", false));
  }

  @Test
  public void siteProfilesAreStableAndDistinctFromLibrary() {
    assertEquals(
        SafeUrls.profile("https://example.com/a"), SafeUrls.profile("https://example.com:443/b"));
    assertNotEquals(
        SafeUrls.profile("https://example.com"), SafeUrls.profile("https://other.example.com"));
    assertTrue(SafeUrls.profile("https://example.com").matches("capture-[a-f0-9]{64}"));
  }
}
