package cc.fishese.postkeeper;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONObject;

/** Standalone instrumented Keystore check: only install/run in the disposable debug app. */
public class KeyVaultInstrumentation extends Instrumentation {
  private Bundle arguments;

  @Override
  public void onCreate(Bundle arguments) {
    super.onCreate(arguments);
    this.arguments = arguments;
    start();
  }

  private void check(boolean condition) {
    if (!condition) throw new AssertionError("Keystore invariant failed");
  }

  @Override
  public void onStart() {
    Bundle result = new Bundle();
    if (arguments != null && "true".equals(arguments.getString("captureUi"))) {
      checkCaptureUi(result);
      return;
    }
    KeyVault vault = new KeyVault(getTargetContext());
    String fixture = "pk1_" + "A".repeat(43);
    try {
      vault.save(fixture);
      check(fixture.equals(vault.load()));
      File file = new File(getTargetContext().getNoBackupFilesDir(), "recovery-v1.json");
      String persisted = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
      check(!persisted.contains(fixture));
      check(!persisted.contains("pk1_"));
      JSONObject envelope = new JSONObject(persisted);
      String ciphertext = envelope.getString("ciphertext");
      envelope.put(
          "ciphertext", (ciphertext.charAt(0) == 'A' ? "B" : "A") + ciphertext.substring(1));
      Files.write(file.toPath(), envelope.toString().getBytes(StandardCharsets.UTF_8));
      boolean rejected = false;
      try {
        vault.load();
      } catch (javax.crypto.AEADBadTagException expected) {
        rejected = true;
      }
      check(rejected);
      vault.clear();
      boolean absent = false;
      try {
        vault.load();
      } catch (IllegalStateException expected) {
        absent = true;
      }
      check(absent);
      result.putString(
          "stream", "Keystore encryption, round-trip, tamper rejection, and forgetting: PASS\n");
      finish(Activity.RESULT_OK, result);
    } catch (Throwable failure) {
      result.putString(
          "stream",
          "Keystore device verification: FAIL (" + failure.getClass().getSimpleName() + ")\n");
      finish(Activity.RESULT_CANCELED, result);
    } finally {
      try {
        vault.clear();
      } catch (Exception ignored) {
      }
    }
  }

  private void checkCaptureUi(Bundle result) {
    CaptureActivity activity = null;
    try {
      Intent intent =
          new Intent(getTargetContext(), CaptureActivity.class)
              .putExtra("url", "https://example.com")
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity = (CaptureActivity) startActivitySync(intent);
      waitForIdleSync();
      View save = activity.findViewById(R.id.capture_save);
      View library = activity.findViewById(R.id.capture_library);
      View menu = activity.findViewById(R.id.capture_menu);
      TextView location = activity.findViewById(R.id.capture_location);
      for (int attempt = 0;
          attempt < 50 && (save.getHeight() == 0 || location.getText().length() == 0);
          attempt++) {
        android.os.SystemClock.sleep(100);
        waitForIdleSync();
      }
      int target = activity.getResources().getDimensionPixelSize(R.dimen.pk_touch_target);
      if (save.getHeight() < target || library.getHeight() < target || menu.getHeight() < target)
        throw new AssertionError(
            "Touch heights: "
                + save.getHeight()
                + ", "
                + library.getHeight()
                + ", "
                + menu.getHeight()
                + "; minimum "
                + target);
      check(library.getContentDescription().equals(activity.getString(R.string.library)));
      check(menu.getContentDescription().equals(activity.getString(R.string.browser_options)));
      check(location.getText().toString().contains("https://example.com"));
      Bitmap screenshot = getUiAutomation().takeScreenshot();
      try (FileOutputStream output =
          new FileOutputStream(
              new File(getTargetContext().getCacheDir(), "capture-ui-review.png"))) {
        screenshot.compress(Bitmap.CompressFormat.PNG, 100, output);
      }
      result.putString(
          "stream",
          "Compact capture toolbar, touch targets, labels, address, and screenshot: PASS\n");
      finish(Activity.RESULT_OK, result);
    } catch (Throwable failure) {
      result.putString(
          "stream",
          "Capture UI verification: FAIL ("
              + failure.getClass().getSimpleName()
              + ": "
              + failure.getMessage()
              + ")\n");
      finish(Activity.RESULT_CANCELED, result);
    }
  }
}
