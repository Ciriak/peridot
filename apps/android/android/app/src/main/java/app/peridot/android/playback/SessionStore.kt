package app.peridot.android.playback

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class PeridotSession(
    val serverAddress: String,
    val token: String,
    val userId: String,
)

class SessionStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences("peridot-session", Context.MODE_PRIVATE)

    fun save(serverAddress: String, token: String, userId: String) {
        val normalized = serverAddress.trimEnd('/')
        val (iv, ciphertext) = encrypt(token)
        preferences.edit {
            putString("serverAddress", normalized)
            putString("userId", userId)
            putString("tokenIv", Base64.encodeToString(iv, Base64.NO_WRAP))
            putString("token", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
        }
    }

    fun read(): PeridotSession? {
        val serverAddress = preferences.getString("serverAddress", null) ?: return null
        val userId = preferences.getString("userId", null) ?: return null
        val iv = preferences.getString("tokenIv", null) ?: return null
        val ciphertext = preferences.getString("token", null) ?: return null
        return runCatching {
            PeridotSession(
                serverAddress = serverAddress,
                token = decrypt(
                    Base64.decode(iv, Base64.NO_WRAP),
                    Base64.decode(ciphertext, Base64.NO_WRAP),
                ),
                userId = userId,
            )
        }.getOrNull()
    }

    fun clear() {
        preferences.edit { clear() }
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
                init(
                    KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                    )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build()
                )
            }
        return generator.generateKey()
    }

    private fun encrypt(value: String): Pair<ByteArray, ByteArray> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return cipher.iv to cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    }

    private fun decrypt(iv: ByteArray, value: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        return cipher.doFinal(value).toString(Charsets.UTF_8)
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "app.peridot.android.session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
