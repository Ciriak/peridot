package app.peridot.android.playback

import android.content.ComponentName
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionError
import androidx.media3.session.SessionToken
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@UnstableApi
@RunWith(AndroidJUnit4::class)
class PeridotAndroidAutoLibraryTest {
    private lateinit var server: MockWebServer
    private lateinit var sessions: SessionStore
    private lateinit var playbackStore: PlaybackStore
    private var browser: MediaBrowser? = null
    private val requests = CopyOnWriteArrayList<String>()
    private val unauthorized = AtomicBoolean(false)

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        sessions = SessionStore(context)
        playbackStore = PlaybackStore(context)
        sessions.clear()
        playbackStore.clear()

        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request.requestUrl?.let { url ->
                    buildString {
                        append(url.encodedPath)
                        if (url.querySize > 0) append("?").append(url.encodedQuery)
                    }
                } ?: request.path.orEmpty()
                if (unauthorized.get() && request.requestUrl?.encodedPath == "/api/albums") {
                    return json("""{"error":"unauthorized"}""", status = 401)
                }
                return responseFor(request)
            }
        }
        server.start()
        sessions.save(
            server.url("/").toString().trimEnd('/'),
            "android-auto-test-token",
            "android-auto-test-user",
        )

        val token = SessionToken(
            context,
            ComponentName(context, PeridotPlaybackService::class.java),
        )
        browser = MediaBrowser.Builder(context, token)
            .buildAsync()
            .get(10, TimeUnit.SECONDS)
    }

    @After
    fun tearDown() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            browser?.stop()
            browser?.clearMediaItems()
            browser?.release()
        }
        browser = null
        playbackStore.clear()
        sessions.clear()
        server.shutdown()
    }

    @Test
    fun libraryLoadsLikedTracksAlbumsAndPlaylistsFromAuthenticatedApi() {
        val liked = children(PeridotPlaybackService.LIKED_ID)
        assertEquals(
            listOf("track:liked-new", "track:liked-old"),
            liked.map { it.mediaId },
        )
        assertEquals("Newest favorite", liked[0].mediaMetadata.title)
        assertTrue(requests.any { it.startsWith("/api/playlists/liked") })
        assertTrue(requests.none { it.startsWith("/api/media?liked=true") })
        assertEquals(
            listOf("track:liked-old"),
            childrenPage(PeridotPlaybackService.LIKED_ID, page = 1, pageSize = 1)
                .map { it.mediaId },
        )

        val albums = children(PeridotPlaybackService.ALBUMS_ID)
        assertEquals(listOf("album:album-1"), albums.map { it.mediaId })
        assertEquals("Night Drive", albums.single().mediaMetadata.title)
        assertEquals(
            MediaMetadata.MEDIA_TYPE_ALBUM,
            albums.single().mediaMetadata.mediaType,
        )
        assertTrue(albums.single().mediaMetadata.isBrowsable == true)
        assertTrue(albums.single().mediaMetadata.isPlayable == true)
        assertEquals(
            server.url("/covers/night-drive.webp").toString(),
            albums.single().mediaMetadata.artworkUri.toString(),
        )

        val playlists = children(PeridotPlaybackService.PLAYLISTS_ID)
        assertEquals(
            listOf("playlist:mix", "playlist:road"),
            playlists.map { it.mediaId },
        )
        assertTrue(requests.contains("/api/playlists?limit=100&offset=0"))
        assertTrue(requests.contains("/api/playlists?limit=100&offset=2"))

        val artists = children(PeridotPlaybackService.ARTISTS_ID)
        assertEquals(listOf("artist:artist-1"), artists.map { it.mediaId })
        assertEquals("Mira North", artists.single().mediaMetadata.title)
    }

    @Test
    fun itemLookupReturnsRealAlbumAndPlaylistMetadata() {
        val album = getItem("album:album-1")
        assertEquals("Night Drive", album.mediaMetadata.title)
        assertEquals("Mira North", album.mediaMetadata.artist)
        assertEquals(MediaMetadata.MEDIA_TYPE_ALBUM, album.mediaMetadata.mediaType)

        val playlist = getItem("playlist:mix")
        assertEquals("Night Mix", playlist.mediaMetadata.title)
        assertEquals(MediaMetadata.MEDIA_TYPE_PLAYLIST, playlist.mediaMetadata.mediaType)
        assertEquals(
            server.url("/covers/mix.webp").toString(),
            playlist.mediaMetadata.artworkUri.toString(),
        )
    }

    @Test
    fun uriLessPlayRequestsExpandAlbumsAtTheRequestedTrack() {
        val albumTracks = children("album:album-1")
        assertEquals(
            listOf("track:album-one-1", "track:album-one-2"),
            albumTracks.map { it.mediaId },
        )
        assertEquals(
            "album:album-1",
            albumTracks[0].mediaMetadata.extras
                ?.getString(PeridotPlaybackService.EXTRA_TRACK_PARENT),
        )

        setMediaItem("track:album-one-2")
        awaitQueue(listOf("track:album-one-1", "track:album-one-2"), 1)
        var firstTrackScheme: String? = null
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            firstTrackScheme =
                requireNotNull(browser).getMediaItemAt(0).localConfiguration?.uri?.scheme
        }
        assertTrue(
            firstTrackScheme == "peridot-track",
        )

        setMediaItem("album:album-1")
        awaitQueue(listOf("track:album-one-1", "track:album-one-2"), 0)
    }

    @Test
    fun signedOutLibraryReturnsAuthenticationExpired() {
        sessions.clear()
        val result = childrenResult(PeridotPlaybackService.LIKED_ID)
        assertEquals(
            SessionError.ERROR_SESSION_AUTHENTICATION_EXPIRED,
            result.resultCode,
        )
    }

    @Test
    fun rejectedSessionReturnsAuthenticationExpired() {
        unauthorized.set(true)
        val result = childrenResult(PeridotPlaybackService.ALBUMS_ID)
        assertEquals(
            SessionError.ERROR_SESSION_AUTHENTICATION_EXPIRED,
            result.resultCode,
        )
    }

    private fun children(parentId: String): ImmutableList<MediaItem> {
        return childrenPage(parentId, 0, Int.MAX_VALUE)
    }

    private fun childrenPage(
        parentId: String,
        page: Int,
        pageSize: Int,
    ): ImmutableList<MediaItem> {
        val result = childrenResult(parentId, page, pageSize)
        assertEquals(0, result.resultCode)
        return requireNotNull(result.value)
    }

    private fun childrenResult(
        parentId: String,
        page: Int = 0,
        pageSize: Int = Int.MAX_VALUE,
    ): LibraryResult<ImmutableList<MediaItem>> {
        lateinit var future: ListenableFuture<LibraryResult<ImmutableList<MediaItem>>>
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            future = requireNotNull(browser).getChildren(
                parentId,
                page,
                pageSize,
                null,
            )
        }
        return future.get(10, TimeUnit.SECONDS)
    }

    private fun getItem(mediaId: String): MediaItem {
        lateinit var future: ListenableFuture<LibraryResult<MediaItem>>
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            future = requireNotNull(browser).getItem(mediaId)
        }
        val result = future.get(10, TimeUnit.SECONDS)
        assertEquals(0, result.resultCode)
        return requireNotNull(result.value)
    }

    private fun setMediaItem(mediaId: String) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            requireNotNull(browser).setMediaItem(
                MediaItem.Builder()
                    .setMediaId(mediaId)
                    .build(),
            )
        }
    }

    private fun awaitQueue(expectedIds: List<String>, expectedIndex: Int) {
        val deadline = System.currentTimeMillis() + 10_000
        while (System.currentTimeMillis() < deadline) {
            var matches = false
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                val current = requireNotNull(browser)
                matches =
                    current.mediaItemCount == expectedIds.size &&
                        current.currentMediaItemIndex == expectedIndex &&
                        (0 until current.mediaItemCount).all { index ->
                            current.getMediaItemAt(index).mediaId == expectedIds[index]
                        }
            }
            if (matches) return
            Thread.sleep(50)
        }
        val actual = mutableListOf<String>()
        var actualIndex = -1
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val current = requireNotNull(browser)
            actualIndex = current.currentMediaItemIndex
            repeat(current.mediaItemCount) { index ->
                actual += current.getMediaItemAt(index).mediaId
            }
        }
        assertEquals("Current index: $actualIndex", expectedIds, actual)
        assertEquals(expectedIndex, actualIndex)
    }

    private fun responseFor(request: RecordedRequest): MockResponse {
        val url = requireNotNull(request.requestUrl)
        return when (url.encodedPath) {
            "/api/playlists/liked" -> json(likedPlaylistJson())
            "/api/playlists" -> when (url.queryParameter("offset")) {
                "0" -> json(playlistsPageOneJson())
                "2" -> json(playlistsPageTwoJson())
                else -> json("""{"items":[],"totalCount":3,"nextOffset":null}""")
            }
            "/api/playlists/mix" -> json(playlistDetailJson("mix", "Night Mix", "mix.webp"))
            "/api/albums" -> json(albumsJson())
            "/api/albums/album-1" -> json(albumJson())
            "/api/artists" -> json(artistsJson())
            "/api/artists/artist-1" -> json(artistJson())
            "/api/media" -> when (url.queryParameter("albumId")) {
                "album-1" -> json(albumTracksJson())
                else -> json(emptyMediaPageJson())
            }
            "/api/media/album-one-1",
            "/api/media/album-one-2",
            "/api/media/liked-new",
            "/api/media/liked-old",
            -> json(trackJson(url.encodedPath.substringAfterLast('/')))
            else -> {
                if (url.encodedPath.endsWith("/playback-token")) {
                    json("""{"token":"playback-token"}""")
                } else {
                    json("""{"error":"not_found"}""", status = 404)
                }
            }
        }
    }

    private fun likedPlaylistJson(): String =
        """
        {
          "id": "liked",
          "kind": "liked-tracks",
          "name": "Liked tracks",
          "trackCount": 2,
          "availableTrackCount": 2,
          "durationMs": 360000,
          "coverUrls": [],
          "liked": false,
          "containsTrack": false,
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-02T00:00:00.000Z",
          "entries": [
            {"id": "liked:liked-new", "position": 0, "title": "Newest favorite", "artist": "Mira North", "artists": ["Mira North"], "album": "Night Drive", "durationMs": 180000, "coverUrl": "/covers/night-drive.webp", "available": true, "liked": true, "media": ${trackJson("liked-new")}, "external": null},
            {"id": "liked:liked-old", "position": 1, "title": "Older favorite", "artist": "Mira North", "artists": ["Mira North"], "album": "Night Drive", "durationMs": 180000, "coverUrl": "/covers/night-drive.webp", "available": true, "liked": true, "media": ${trackJson("liked-old")}, "external": null}
          ]
        }
        """.trimIndent()

    private fun playlistsPageOneJson(): String =
        """
        {
          "items": [
            {"id":"liked","kind":"liked-tracks","name":"Liked tracks","trackCount":2,"availableTrackCount":2,"durationMs":360000,"coverUrls":[],"liked":false,"containsTrack":false,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z"},
            {"id":"mix","kind":"manual","name":"Night Mix","trackCount":2,"availableTrackCount":2,"durationMs":360000,"coverUrls":["/covers/mix.webp"],"liked":false,"containsTrack":false,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z"}
          ],
          "totalCount": 3,
          "nextOffset": 2
        }
        """.trimIndent()

    private fun playlistsPageTwoJson(): String =
        """
        {
          "items": [
            {"id":"road","kind":"manual","name":"Open Road","trackCount":1,"availableTrackCount":1,"durationMs":180000,"coverUrls":["/covers/night-drive.webp"],"liked":false,"containsTrack":false,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z"}
          ],
          "totalCount": 3,
          "nextOffset": null
        }
        """.trimIndent()

    private fun playlistDetailJson(
        id: String,
        title: String,
        cover: String,
    ): String =
        """
        {
          "id": "$id",
          "kind": "manual",
          "name": "$title",
          "trackCount": 2,
          "availableTrackCount": 2,
          "durationMs": 360000,
          "coverUrls": ["/covers/$cover"],
          "liked": false,
          "containsTrack": false,
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-02T00:00:00.000Z",
          "entries": []
        }
        """.trimIndent()

    private fun albumsJson(): String =
        """
        {
          "items": [
            {"id":"album-1","title":"Night Drive","artist":"Mira North","artists":["Mira North"],"sourceKinds":["path"],"coverUrl":"/covers/night-drive.webp","trackCount":2,"durationMs":360000,"releaseYear":2026,"available":true,"liked":false}
          ],
          "nextCursor": null,
          "totalCount": 1,
          "catalogRevision": 1
        }
        """.trimIndent()

    private fun albumJson(): String =
        """
        {"id":"album-1","title":"Night Drive","artist":"Mira North","artists":["Mira North"],"sourceKinds":["path"],"coverUrl":"/covers/night-drive.webp","trackCount":2,"durationMs":360000,"releaseYear":2026,"available":true,"liked":false}
        """.trimIndent()

    private fun artistsJson(): String =
        """
        {
          "items": [
            {"id":"artist-1","name":"Mira North","localName":"Mira North","albumCount":1,"trackCount":2,"durationMs":360000,"imageUrl":"/covers/artist.webp","metadata":null,"available":true,"liked":false}
          ],
          "nextCursor": null,
          "totalCount": 1,
          "catalogRevision": 1
        }
        """.trimIndent()

    private fun artistJson(): String =
        """
        {"id":"artist-1","name":"Mira North","localName":"Mira North","albumCount":1,"trackCount":2,"durationMs":360000,"imageUrl":"/covers/artist.webp","metadata":null,"available":true,"liked":false}
        """.trimIndent()

    private fun albumTracksJson(): String =
        """
        {
          "items": [
            ${trackJson("album-one-1")},
            ${trackJson("album-one-2")}
          ],
          "nextCursor": null,
          "totalCount": 2,
          "catalogRevision": 1
        }
        """.trimIndent()

    private fun emptyMediaPageJson(): String =
        """{"items":[],"nextCursor":null,"totalCount":0,"catalogRevision":1}"""

    private fun trackJson(id: String): String =
        """
        {
          "id":"$id",
          "title":"${when (id) {
              "liked-new" -> "Newest favorite"
              "liked-old" -> "Older favorite"
              "album-one-2" -> "Second Track"
              else -> "First Track"
          }}",
          "artist":"Mira North",
          "artists":["Mira North"],
          "album":"Night Drive",
          "albumId":"album-1",
          "durationMs":180000,
          "coverUrl":"/covers/night-drive.webp",
          "mimeType":"audio/flac",
          "available":true,
          "mediaType":"music",
          "liked":false
        }
        """.trimIndent()

    private fun json(body: String, status: Int = 200): MockResponse =
        MockResponse()
            .setResponseCode(status)
            .setHeader("Content-Type", "application/json")
            .setBody(body)
}
