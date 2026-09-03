package cc.fishese.postkeeper;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONObject;

/** Standalone instrumented Keystore check: only install/run in the disposable debug app. */
public class KeyVaultInstrumentation extends Instrumentation {
  @Override
  public void onCreate(Bundle arguments) {
    super.onCreate(arguments);
    start();
  }

  private void check(boolean condition) {
    if (!condition) throw new AssertionError("Keystore invariant failed");
  }

  @Override
  public void onStart() {
    Bundle result = new Bundle();
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
}
