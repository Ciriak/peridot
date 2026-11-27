package app.peridot.android.playback

import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import org.json.JSONArray
import org.json.JSONObject

data class BrowseEntry(
    val id: String,
    val title: String,
    val subtitle: String,
    val coverUrl: String?,
    val track: TrackSnapshot? = null,
)

class SessionExpiredException : Exception("The Peridot session is no longer valid.")

class LibraryRequestException(
    val statusCode: Int,
    message: String,
) : Exception(message)

class PeridotApiClient(
    private val sessions: SessionStore,
) {
    private val cacheLock = Any()
    private val catalogCache = mutableMapOf<String, CatalogCacheEntry>()
    private var catalogCacheScope: String? = null

    fun playbackUrl(trackId: String): String {
        val session = requireSession()
        val response = requestJson(
            session,
            "/api/media/${encodePath(trackId)}/playback-token",
            method = "POST",
        )
        val token = response.getString("token")
        return "${session.serverAddress}/api/media/${encodePath(trackId)}/audio" +
            "?playbackToken=${encodePath(token)}"
    }

    fun track(trackId: String): TrackSnapshot {
        val session = requireSession()
        return trackFromJson(
            requestJson(session, "/api/media/${encodePath(trackId)}"),
            session.serverAddress,
        )
    }

    fun likedTracks(): List<TrackSnapshot> {
        val session = requireSession()
        return cached(session, "liked-tracks") {
            playlistTracks(session, "liked")
        }
    }

    fun albumTracks(albumId: String): List<TrackSnapshot> {
        val session = requireSession()
        return cached(session, "album-tracks:$albumId") {
            allTrackPages(
                session,
                mapOf("albumId" to albumId, "limit" to "200"),
            )
        }
    }

    fun artistTracks(artistId: String): List<TrackSnapshot> {
        val session = requireSession()
        return cached(session, "artist-tracks:$artistId") {
            allTrackPages(
                session,
                mapOf("artistId" to artistId, "limit" to "200"),
            )
        }
    }

    fun albums(): List<BrowseEntry> {
        val session = requireSession()
        return cached(session, "albums") {
            loadAlbums(session)
        }
    }

    fun album(albumId: String): BrowseEntry? {
        val session = requireSession()
        return try {
            albumEntry(
                session,
                requestJson(session, "/api/albums/${encodePath(albumId)}"),
            )
        } catch (error: LibraryRequestException) {
            if (error.statusCode == 404) null else throw error
        }
    }

    private fun loadAlbums(session: PeridotSession): List<BrowseEntry> {
        val items = mutableListOf<BrowseEntry>()
        var cursor: String? = null
        do {
            val params = linkedMapOf("limit" to "100")
            cursor?.let { params["cursor"] = it }
            val page = requestJson(session, "/api/albums${query(params)}")
            val pageItems = page.optJSONArray("items") ?: JSONArray()
            for (index in 0 until pageItems.length()) {
                items += albumEntry(session, pageItems.getJSONObject(index))
            }
            cursor = page.optNullableString("nextCursor")
        } while (cursor != null && items.size < MAX_LIBRARY_ITEMS)
        return items
    }

    fun artists(): List<BrowseEntry> {
        val session = requireSession()
        return cached(session, "artists") {
            loadArtists(session)
        }
    }

    private fun loadArtists(session: PeridotSession): List<BrowseEntry> {
        val items = mutableListOf<BrowseEntry>()
        var cursor: String? = null
        do {
            val params = linkedMapOf("limit" to "100")
            cursor?.let { params["cursor"] = it }
            val page = requestJson(session, "/api/artists${query(params)}")
            val pageItems = page.optJSONArray("items") ?: JSONArray()
            for (index in 0 until pageItems.length()) {
                items += artistEntry(session, pageItems.getJSONObject(index))
            }
            cursor = page.optNullableString("nextCursor")
        } while (cursor != null && items.size < MAX_LIBRARY_ITEMS)
        return items
    }

    fun artist(artistId: String): BrowseEntry? {
        val session = requireSession()
        return try {
            artistEntry(
                session,
                requestJson(session, "/api/artists/${encodePath(artistId)}"),
            )
        } catch (error: LibraryRequestException) {
            if (error.statusCode == 404) null else throw error
        }
    }

    fun playlists(): List<BrowseEntry> {
        val session = requireSession()
        return cached(session, "playlists") {
            loadPlaylists(session)
        }
    }

    fun playlistTracks(playlistId: String): List<TrackSnapshot> {
        val session = requireSession()
        return cached(session, "playlist-tracks:$playlistId") {
            playlistTracks(session, playlistId)
        }
    }

    fun playlist(playlistId: String): BrowseEntry? {
        val session = requireSession()
        return try {
            playlistEntry(
                session,
                requestJson(session, "/api/playlists/${encodePath(playlistId)}"),
            )
        } catch (error: LibraryRequestException) {
            if (error.statusCode == 404) null else throw error
        }
    }

    private fun loadPlaylists(session: PeridotSession): List<BrowseEntry> {
        val items = mutableListOf<BrowseEntry>()
        var offset = 0
        var nextOffset: Int?
        do {
            val response = requestJson(
                session,
                "/api/playlists${query(linkedMapOf("limit" to "100", "offset" to offset.toString()))}",
            )
            val pageItems = response.optJSONArray("items") ?: JSONArray()
            for (index in 0 until pageItems.length()) {
                val item = pageItems.getJSONObject(index)
                if (item.optString("kind") == "liked-tracks") continue
                items += playlistEntry(session, item)
            }
            nextOffset = if (response.isNull("nextOffset")) {
                null
            } else {
                response.optInt("nextOffset").takeIf { it > offset }
            }
            offset = nextOffset ?: 0
        } while (nextOffset != null && items.size < MAX_LIBRARY_ITEMS)
        return items
    }

    private fun playlistTracks(
        session: PeridotSession,
        playlistId: String,
    ): List<TrackSnapshot> {
        val response = requestJson(session, "/api/playlists/${encodePath(playlistId)}")
        val entries = response.optJSONArray("entries") ?: JSONArray()
        return buildList {
            for (index in 0 until entries.length()) {
                val track = entries.getJSONObject(index).optJSONObject("media") ?: continue
                add(trackFromJson(track, session.serverAddress))
            }
        }
    }

    fun search(text: String): List<BrowseEntry> {
        val session = requireSession()
        val queryText = text.trim()
        if (queryText.isBlank()) return emptyList()
        val tracks = searchTracks(session, queryText)
        val albums = searchEntries(
            session,
            "/api/albums",
            queryText,
            "album",
            "title",
            "artist",
            "coverUrl",
        )
        val artists = searchEntries(
            session,
            "/api/artists",
            queryText,
            "artist",
            "name",
            "localName",
            "imageUrl",
        )
        val playlists = searchEntries(
            session,
            "/api/playlists",
            queryText,
            "playlist",
            "name",
            "trackCount",
            null,
        )
        return buildList {
            addAll(tracks)
            addAll(albums)
            addAll(artists)
            addAll(playlists)
        }
    }

    fun clearCachedSession() {
        sessions.clear()
        clearCatalogCache()
    }

    private fun searchTracks(
        session: PeridotSession,
        text: String,
    ): List<BrowseEntry> {
        val response = requestJson(
            session,
            "/api/media${query(linkedMapOf("query" to text, "limit" to "40"))}",
        )
        val items = response.optJSONArray("items") ?: JSONArray()
        return buildList {
            for (index in 0 until items.length()) {
                val track = trackFromJson(items.getJSONObject(index), session.serverAddress)
                add(track.asBrowseEntry())
            }
        }
    }

    private fun searchEntries(
        session: PeridotSession,
        path: String,
        text: String,
        kind: String,
        titleKey: String,
        subtitleKey: String,
        coverKey: String?,
    ): List<BrowseEntry> {
        val response = requestJson(
            session,
            "$path${query(linkedMapOf("query" to text, "limit" to "20"))}",
        )
        val items = response.optJSONArray("items") ?: JSONArray()
        return buildList {
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val subtitle = if (subtitleKey == "trackCount") {
                    "${item.optInt("trackCount", 0)} tracks"
                } else {
                    item.optString(subtitleKey, "")
                }
                val title = item.optString(titleKey, "Untitled")
                if (path == "/api/playlists" && !title.contains(text, ignoreCase = true)) {
                    continue
                }
                add(
                    BrowseEntry(
                        id = "$kind:${item.getString("id")}",
                        title = title,
                        subtitle = subtitle,
                        coverUrl = coverKey?.let {
                            absoluteUrl(
                                session.serverAddress,
                                item.optNullableString(it),
                            )
                        },
                    )
                )
            }
        }
    }

    private fun allTrackPages(
        session: PeridotSession,
        parameters: Map<String, String>,
    ): List<TrackSnapshot> {
        val tracks = mutableListOf<TrackSnapshot>()
        var cursor: String? = null
        do {
            val params = LinkedHashMap(parameters)
            cursor?.let { params["cursor"] = it }
            val page = requestJson(
                session,
                "/api/media${query(params)}",
            )
            val items = page.optJSONArray("items") ?: JSONArray()
            for (index in 0 until items.length()) {
                tracks += trackFromJson(items.getJSONObject(index), session.serverAddress)
            }
            cursor = page.optNullableString("nextCursor")
        } while (cursor != null && tracks.size < MAX_LIBRARY_ITEMS)
        return tracks
    }

    private fun requestJson(
        session: PeridotSession,
        path: String,
        method: String = "GET",
    ): JSONObject {
        val connection =
            URL("${session.serverAddress}$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.setRequestProperty("Authorization", "Bearer ${session.token}")
            connection.setRequestProperty("Accept", "application/json")
            if (method != "GET" && method != "HEAD") {
                val payload = "{}".toByteArray(Charsets.UTF_8)
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setFixedLengthStreamingMode(payload.size)
                connection.outputStream.use { it.write(payload) }
            }
            val status = connection.responseCode
            if (status == 401) {
                sessions.clear()
                clearCatalogCache()
                throw SessionExpiredException()
            }
            val stream =
                if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            if (status !in 200..299) {
                throw LibraryRequestException(
                    status,
                    "Peridot request failed with HTTP $status",
                )
            }
            return if (body.isBlank()) JSONObject() else JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }

    private fun requireSession(): PeridotSession =
        sessions.read() ?: throw SessionExpiredException()

    private fun trackFromJson(
        value: JSONObject,
        serverAddress: String,
    ): TrackSnapshot {
        val track = TrackSnapshot.fromJson(value)
        return track.copy(
            coverUrl = absoluteUrl(serverAddress, track.coverUrl),
        )
    }

    private fun albumEntry(
        session: PeridotSession,
        item: JSONObject,
    ): BrowseEntry = BrowseEntry(
        id = "album:${item.getString("id")}",
        title = item.optString("title", "Untitled album"),
        subtitle = item.optString("artist", ""),
        coverUrl = absoluteUrl(
            session.serverAddress,
            item.optNullableString("coverUrl"),
        ),
    )

    private fun artistEntry(
        session: PeridotSession,
        item: JSONObject,
    ): BrowseEntry = BrowseEntry(
        id = "artist:${item.getString("id")}",
        title = item.optString("name", "Unknown artist"),
        subtitle = item.optString("localName", ""),
        coverUrl = absoluteUrl(
            session.serverAddress,
            item.optNullableString("imageUrl"),
        ),
    )

    private fun playlistEntry(
        session: PeridotSession,
        item: JSONObject,
    ): BrowseEntry {
        val covers = item.optJSONArray("coverUrls")
        return BrowseEntry(
            id = "playlist:${item.getString("id")}",
            title = item.optString("name", "Untitled playlist"),
            subtitle = "${item.optInt("trackCount", 0)} tracks",
            coverUrl = if (covers != null && covers.length() > 0) {
                absoluteUrl(
                    session.serverAddress,
                    covers.optString(0).takeIf(String::isNotBlank),
                )
            } else {
                null
            },
        )
    }

    private fun TrackSnapshot.asBrowseEntry() = BrowseEntry(
        id = "track:$id",
        title = title,
        subtitle = artist,
        coverUrl = coverUrl,
        track = this,
    )

    private fun absoluteUrl(serverAddress: String, value: String?): String? {
        if (value.isNullOrBlank()) return null
        return if (value.startsWith("http://") || value.startsWith("https://")) {
            value
        } else {
            "${serverAddress.trimEnd('/')}/${value.trimStart('/')}"
        }
    }

    private fun query(values: Map<String, String>): String {
        if (values.isEmpty()) return ""
        return values.entries.joinToString("&", prefix = "?") { (key, value) ->
            "${encodePath(key)}=${encodePath(value)}"
        }
    }

    private fun encodePath(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    @Suppress("UNCHECKED_CAST")
    private fun <T : Any> cached(
        session: PeridotSession,
        key: String,
        load: () -> T,
    ): T {
        val scope = "${session.serverAddress}|${session.userId}"
        val now = System.currentTimeMillis()
        synchronized(cacheLock) {
            if (catalogCacheScope != scope) {
                catalogCache.clear()
                catalogCacheScope = scope
            }
            val cached = catalogCache[key]
            if (cached != null && cached.expiresAtMs > now) {
                return cached.value as T
            }
        }
        val value = load()
        synchronized(cacheLock) {
            if (catalogCacheScope == scope) {
                catalogCache[key] = CatalogCacheEntry(
                    expiresAtMs = now + CATALOG_CACHE_TTL_MS,
                    value = value,
                )
            }
        }
        return value
    }

    private fun clearCatalogCache() {
        synchronized(cacheLock) {
            catalogCache.clear()
            catalogCacheScope = null
        }
    }

    private data class CatalogCacheEntry(
        val expiresAtMs: Long,
        val value: Any,
    )

    private companion object {
        const val MAX_LIBRARY_ITEMS = 10_000
        const val CATALOG_CACHE_TTL_MS = 60_000L
    }
}
