package expo.modules.gathermindwidget

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal object WidgetSnapshotStore {
  private const val maximumSnapshotBytes = 128 * 1024
  private const val keyAlias = "gather-mind-widget-snapshot-key-v1"
  private const val preferencesName = "gather-mind-widget-encrypted-v1"
  private const val cipherTextKey = "ciphertext"
  private const val ivKey = "iv"

  fun write(context: Context, raw: String) {
    require(raw.toByteArray(Charsets.UTF_8).size <= maximumSnapshotBytes) { "Gather Mind widget snapshot is too large." }
    require(JSONObject(raw).optInt("version") == 1) { "Unsupported Gather Mind widget snapshot." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
    val encrypted = cipher.doFinal(raw.toByteArray(Charsets.UTF_8))
    val saved = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit()
      .putString(cipherTextKey, Base64.encodeToString(encrypted, Base64.NO_WRAP))
      .putString(ivKey, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .commit()
    check(saved) { "The encrypted widget summary could not be saved." }
  }

  fun read(context: Context): String? {
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    val encodedCipherText = preferences.getString(cipherTextKey, null) ?: return null
    val encodedIv = preferences.getString(ivKey, null) ?: return null
    return runCatching {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(
        Cipher.DECRYPT_MODE,
        existingKey() ?: return null,
        GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)),
      )
      String(cipher.doFinal(Base64.decode(encodedCipherText, Base64.NO_WRAP)), Charsets.UTF_8)
    }.getOrNull()
  }

  fun clear(context: Context) {
    val cleared = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit().clear().commit()
    check(cleared) { "The encrypted widget summary could not be removed." }
    val keyStore = androidKeyStore()
    if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias)
  }

  private fun androidKeyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun existingKey(): SecretKey? = androidKeyStore().getKey(keyAlias, null) as? SecretKey

  private fun getOrCreateKey(): SecretKey {
    existingKey()?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        keyAlias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }
}
