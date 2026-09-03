package cc.fishese.postkeeper;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

final class KeyVault {
  private static final String ALIAS = "postkeeper-recovery-v1";
  private final java.io.File file;

  KeyVault(Context context) {
    file = new java.io.File(context.getNoBackupFilesDir(), "recovery-v1.json");
  }

  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (!store.containsAlias(ALIAS)) {
      KeyGenerator generator =
          KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      generator.init(
          new KeyGenParameterSpec.Builder(
                  ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .setKeySize(256)
              .build());
      generator.generateKey();
    }
    return (SecretKey) store.getKey(ALIAS, null);
  }

  void save(String recovery) throws Exception {
    if (!recovery.matches("pk1_[A-Za-z0-9_-]{43}"))
      throw new IllegalArgumentException("Enter a valid PostKeeper recovery key.");
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key());
    cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
    JSONObject encoded =
        new JSONObject()
            .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put(
                "ciphertext",
                Base64.encodeToString(
                    cipher.doFinal(recovery.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
    android.util.AtomicFile atomic = new android.util.AtomicFile(file);
    java.io.FileOutputStream stream = atomic.startWrite();
    try {
      stream.write(encoded.toString().getBytes(StandardCharsets.UTF_8));
      atomic.finishWrite(stream);
    } catch (Exception e) {
      atomic.failWrite(stream);
      throw e;
    }
  }

  String load() throws Exception {
    if (!file.exists()) throw new IllegalStateException("No key is saved on this device.");
    JSONObject encoded;
    try (java.io.FileInputStream stream = new android.util.AtomicFile(file).openRead()) {
      encoded =
          new JSONObject(
              new String(CaptureActivity.readBounded(stream, 4096), StandardCharsets.UTF_8));
    }
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
        Cipher.DECRYPT_MODE,
        key(),
        new GCMParameterSpec(128, Base64.decode(encoded.getString("iv"), Base64.NO_WRAP)));
    cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
    return new String(
        cipher.doFinal(Base64.decode(encoded.getString("ciphertext"), Base64.NO_WRAP)),
        StandardCharsets.UTF_8);
  }

  void clear() throws Exception {
    new android.util.AtomicFile(file).delete();
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (store.containsAlias(ALIAS)) store.deleteEntry(ALIAS);
  }
}
