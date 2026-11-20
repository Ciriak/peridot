import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the persistent player controls a native audio element", async () => {
  const [player, layout, app, toasts] = await Promise.all([
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/toasts.ts", import.meta.url), "utf8"),
  ]);

  assert.match(player, /new Audio\(\)/);
  assert.match(player, /createPlaybackToken\(/);
  assert.match(player, /recordTrackPlay\(/);
  assert.match(
    player,
    /await audio\.play\(\);[\s\S]*?lastRecordedPlaybackRequest !== playbackRequest\.value[\s\S]*?recordTrackPlay\(/,
    "Play history is recorded only after successful playback for a new run",
  );
  assert.match(player, /\.catch\(\(\) => undefined\)/);
  assert.match(player, /trackAudioUrl\(/);
  assert.match(player, /downloadTrack\(trackId = currentTrackId\.value\)/);
  assert.match(player, /anchor\.download = trackDownloadFileName\(track\)/);
  assert.doesNotMatch(
    player,
    /notifyTrackDownloaded\(/,
    "A successful browser download does not add a toast",
  );
  assert.doesNotMatch(
    toasts,
    /Download ready/,
    "Downloads have no success toast",
  );
  assert.match(player, /notifyTrackDownloadFailed\(/);
  assert.match(player, /addEventListener\("timeupdate"/);
  assert.match(player, /addEventListener\("loadedmetadata"/);
  assert.match(player, /addEventListener\("ended"/);
  assert.match(player, /addEventListener\("waiting"/);
  assert.match(player, /addEventListener\("stalled"/);
  assert.match(player, /addEventListener\("playing"/);
  assert.match(player, /audio\.currentTime = elapsed\.value/);
  assert.match(player, /audio\.volume = value \/ 100/);
  assert.match(
    player,
    /watch\(elapsed, \(position\)/,
    "Changing the shared position seeks the native media",
  );
  assert.match(player, /audio\.currentTime = position/);
  assert.match(player, /readPersistedPlayerState\(window\.localStorage/);
  assert.match(player, /savePersistedPlayerState\(window\.localStorage/);
  assert.doesNotMatch(player, /fetchQueue\(|\/api\/queue/);
  assert.match(
    player,
    /const stored = readPersistedPlayerState\(window\.localStorage, scope\);[\s\S]*?setQueueSnapshot\([\s\S]*?trackIds: stored\.queueTrackIds[\s\S]*?activeTrackId: stored\.currentTrackId[\s\S]*?elapsed\.value = stored\.positionSeconds/,
    "A reload restores the selected track, active queue, and playback progress locally",
  );
  assert.match(
    player,
    /watch\(\s*\[queueTrackIds, activeTrackId, shuffleEnabled, shuffleTrackIds, elapsed\]/,
    "Queue changes and progress updates are mirrored to local storage",
  );
  assert.match(
    player,
    /missingIds\.length[\s\S]*resolveTracks\(/,
    "Normal playback resolves missing queue details instead of reloading the queue",
  );
  assert.match(
    player,
    /mergePlayerQueueTracks\(\s*queueTracks\.value,\s*items,\s*remappedIds,?\s*\)/,
    "Queue hydration preserves already-resolved track objects",
  );
  assert.match(
    player,
    /aliases\[trackId\] \?\? trackId/,
    "Queue hydration applies canonical duplicate aliases",
  );
  assert.match(
    player,
    /positionSeconds: elapsed\.value/,
    "The persisted snapshot includes playback progress",
  );
  assert.match(
    player,
    /queueTrackIds: queueTrackIds\.value/,
    "The persisted snapshot includes the complete queue",
  );
  assert.match(
    player,
    /previous !== undefined && trackId !== previousTrackId/,
    "Remounting the player preserves the current elapsed position",
  );
  assert.match(
    app,
    /useLibraryPlayer\(\{ audio: true \}\)/,
    "Audio playback is mounted at the persistent application root",
  );
  assert.doesNotMatch(
    layout,
    /useLibraryPlayer\(\{ audio: true \}\)/,
    "Changing layouts must not tear down audio playback",
  );
  assert.doesNotMatch(
    layout,
    /loadQueue\(\)/,
    "Changing layouts must not restore player state over active playback",
  );
  assert.match(layout, /currentCoverUrl = computed\(/);
  assert.match(layout, /<FadeInImage[\s\S]*:src="currentCoverImageUrl"/);
  assert.match(layout, /icons\.book/);
  assert.match(layout, /icons\.podcast/);
  assert.match(layout, /icons\.album/);
  assert.match(layout, /icons\.music/);
  assert.match(
    layout,
    /<TrackArtistLinks\s+v-if="active\.mediaType === 'music'"\s+:artists="trackArtistNames\(active\)"\s+\/>/,
    "The active track's credited artists link from the persistent player",
  );
  assert.match(
    layout,
    /<p v-else class="select-none text-sm font-medium">/,
    "Unlinked player titles cannot be selected",
  );
  assert.match(layout, /@click="togglePlayback"/);
  assert.match(layout, /@click="cycleRepeatMode"/);
  assert.match(layout, /@update:model-value="seek\(\$event\?\.\[0\] \?\? 0\)"/);
  assert.match(
    layout,
    /<Slider\s+:model-value="\[elapsed\]"[\s\S]*?:aria-busy="loading"[\s\S]*?class="min-h-11 flex-1"[\s\S]*?t\('player\.position'\)/,
    "The playback progress uses a taller hit target and exposes its loading state",
  );
  assert.match(
    layout,
    /@update:model-value="setVolume\(\$event\?\.\[0\] \?\? 0\)"/,
  );
  assert.match(layout, /:icon="icons\.volume"[\s\S]*t\('player\.volume'\)/);
  const playerFooter = layout.slice(
    layout.indexOf("<footer"),
    layout.indexOf("</footer>"),
  );
  assert.doesNotMatch(
    playerFooter,
    /<PeridotSpinner/,
    "The player switches directly between play and pause without a spinner",
  );
  assert.doesNotMatch(
    playerFooter,
    /nowPlayingKey/,
    "Now-playing metadata changes immediately with the active track",
  );
  assert.doesNotMatch(
    playerFooter,
    /Preparing audio/,
    "The player never replaces the artist list with a preparing-audio label",
  );
  assert.match(
    playerFooter,
    /v-if="loading"[\s\S]*class="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 overflow-hidden"[\s\S]*bg-primary\/40 motion-reduce:block[\s\S]*from-transparent via-primary to-transparent transition-transform duration-1000 ease-in-out motion-reduce:hidden[\s\S]*loadingRayAtRight \? 'translate-x-full' : '-translate-x-full'/,
    "The player shows a primary ray that reverses across the bar while loading",
  );
  assert.doesNotMatch(
    playerFooter,
    /motion-safe:animate-pulse/,
    "The player loading state does not pulse the seek control",
  );
  assert.match(
    layout,
    /const currentArtworkRoute = computed\(\(\) =>[\s\S]*?track\.mediaType !== "music"[\s\S]*?trackAlbumRoute\(track\)/,
    "Only an available music album becomes an artwork route",
  );
  assert.match(
    playerFooter,
    /<NuxtLink\s+v-if="currentArtworkRoute"\s+:to="currentArtworkRoute"\s+:aria-label="\s*t\('player\.openAlbum'/,
    "The desktop player artwork opens its album",
  );
  assert.match(
    playerFooter,
    /class="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground md:size-20"/,
    "The player artwork is larger on compact and medium layouts",
  );
  assert.match(
    layout,
    /:icon="playing \? icons\.pause : icons\.play"/,
    "The player switches directly from play to pause",
  );
  assert.match(
    await readFile(
      new URL(
        "../../android/android/app/src/main/java/app/peridot/android/playback/PeridotPlaybackService.kt",
        import.meta.url,
      ),
      "utf8",
    ),
    /playing = playbackControlActive\([\s\S]*playWhenReady = player\.playWhenReady[\s\S]*playbackState = player\.playbackState[\s\S]*hasError = lastError != null/,
    "Android exposes requested playback while Media3 is buffering",
  );
  assert.match(
    playerFooter,
    /<div\s+aria-hidden="true"\s+class="pointer-events-none absolute inset-y-0 left-0 -z-10 w-2\/3[\s\S]*<div class="absolute inset-0 opacity-40">[\s\S]*<Transition[\s\S]*<FadeInImage\s+v-if="currentCoverImageUrl && !coverFailed"[\s\S]*:src="currentCoverImageUrl"[\s\S]*scale-125 object-left blur-3xl/,
    "The decorative background stays mounted while its current cover is rendered",
  );
  assert.doesNotMatch(
    playerFooter,
    /<div\s+v-if="currentCoverUrl && !coverFailed"\s+aria-hidden="true"\s+class="pointer-events-none absolute inset-y-0 left-0/,
    "Missing cover art fades out instead of abruptly removing the background layer",
  );
  assert.equal(
    playerFooter.match(/:key="currentCoverImageUrl"/g)?.length,
    2,
    "Both player cover layers update when the track cover changes",
  );
  assert.match(
    playerFooter,
    /<Transition\s+enter-active-class="transition-opacity duration-3000 delay-150 ease-in-out motion-reduce:transition-none"[\s\S]*leave-active-class="transition-opacity duration-3000 delay-150 ease-in-out motion-reduce:transition-none"[\s\S]*<FadeInImage\s+v-if="currentCoverImageUrl && !coverFailed"\s+:key="currentCoverImageUrl"\s+:src="currentCoverImageUrl"/,
    "The decorative player background waits briefly, then directly crossfades over three seconds",
  );
  assert.equal(
    playerFooter.match(/<Transition/g)?.length,
    1,
    "The visible player artwork changes immediately instead of crossfading",
  );
  assert.doesNotMatch(
    playerFooter,
    /mode="out-in"/,
    "The decorative cover crossfade overlaps the outgoing and incoming artwork",
  );
  assert.match(
    playerFooter,
    /absolute inset-y-0 right-0 w-1\/2 bg-linear-to-r from-transparent via-card\/60 to-card/,
    "The blurred clone fades into the player's card surface on its right edge",
  );
  assert.match(
    playerFooter,
    /bg-linear-to-r from-card\/20 via-card\/70 to-card/,
    "The source-colored player background fades into the card surface",
  );
  assert.match(layout, /role="alert"/);
  assert.match(player, /useState<RepeatMode>\("player-repeat-mode"/);
  assert.match(
    player,
    /repeatMode\.value === "one"[\s\S]*playbackRequest\.value\+\+/,
  );
  assert.match(
    player,
    /repeatMode\.value === "all"[\s\S]*repeatCycleTrackIds\.value/,
  );
  assert.match(
    layout,
    /repeatMode === 'one' \? icons\.repeatOne : icons\.repeat/,
  );
  assert.match(layout, /:aria-pressed="repeatMode !== 'off'"/);
  assert.match(
    layout,
    /repeatMode === 'off'\s*\?\s*'text-muted-foreground'\s*:\s*'text-primary group-hover:text-primary group-active:text-primary'/,
    "Enabled repeat modes color the icon primary",
  );
  assert.match(
    layout,
    /absolute right-1 top-1 text-xs font-semibold leading-none text-primary/,
    "The repeat-one marker floats at the icon's top-right",
  );
  const metadataControlIndex = playerFooter.indexOf("<TrackContextMenu");
  const transportControlIndex = playerFooter.indexOf(
    '<div class="w-full space-y-1',
  );
  const artistLinksIndex = playerFooter.indexOf("<TrackArtistLinks");
  const likeControlIndex = playerFooter.indexOf("<LikeButton");
  assert.ok(
    metadataControlIndex >= 0 &&
      artistLinksIndex > metadataControlIndex &&
      likeControlIndex > artistLinksIndex &&
      likeControlIndex < transportControlIndex,
    "The track like control sits after the artist name in the player metadata",
  );
  assert.match(
    playerFooter,
    /<TrackContextMenu\s+v-if="active"\s+:track="active"\s+@play="playActiveTrack"\s*>/,
    "The active player track metadata is a context-menu trigger",
  );
  assert.match(
    playerFooter,
    /<ScrollingText\s+:key="`\$\{active\.id\}:\$\{active\.title\}`"\s+mode="always"\s+class="w-full"\s*>[\s\S]*?<NuxtLink\s+v-if="currentTrackTitleRoute"/,
    "Only the active player title uses the always-on scrolling text component",
  );
  assert.equal(
    playerFooter.match(/<ScrollingText\b/g)?.length,
    2,
    "The player applies scrolling text to the title and artist line only",
  );
  assert.match(
    playerFooter,
    /<ScrollingText\s+v-else\s+mode="always"\s+class="min-w-0 flex-1 text-xs text-muted-foreground"\s*>[\s\S]*?<TrackArtistLinks\s+v-if="active\.mediaType === 'music'"\s+:artists="trackArtistNames\(active\)"\s*\/>/,
    "The active player artist line uses the always-on scrolling text component",
  );
  assert.doesNotMatch(
    playerFooter,
    /class="[^"]*\btruncate\b[^"]*"[^>]*>\s*\{\{ active\.title \}\}/,
    "The rolling player title no longer truncates its own content",
  );
  assert.doesNotMatch(
    layout,
    /active:bg-primary|bg-primary text-primary-foreground/,
    "Player hover and press states color the icon instead of the button",
  );
});

test("the player replaces known track metadata without an unresolved frame", async () => {
  const [player, trackTable, queueDrawer, collections] = await Promise.all([
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QueueDrawer.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/catalog-collections.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    player,
    /const active = computed\(\(\) =>\s+selectPlayerTrack\(resolvedQueueTracks\.value, activeTrackId\.value\),?\s+\);/,
    "A pending active-track detail never falls back to another queue track",
  );
  assert.match(
    player,
    /rememberQueueTrackDetails\(track \? \[track\] : \[\], trackIds\);\s+setQueueSnapshot\(/,
    "A selected known track is added before its queue snapshot becomes active",
  );
  assert.match(
    player,
    /rememberQueueTrackDetails\(playableTracks, nextQueue\);\s+setQueueSnapshot\(/,
    "Known collection tracks are added before the collection queue becomes active",
  );
  assert.match(
    trackTable,
    /playCollection\([\s\S]*props\.tracks\.filter\(\(candidate\) => !isUnavailable\(candidate\)\),[\s\S]*track\.id/,
    "Track-table playback forwards the loaded track objects",
  );
  assert.match(
    queueDrawer,
    /@click\.stop="play\(track\)"/,
    "Queue playback forwards its loaded track object",
  );
  assert.match(
    collections,
    /Promise<TrackResponse\[\]>[\s\S]*tracks\.push\(\.\.\.page\.items\)/,
    "Collection loading retains track metadata instead of returning IDs only",
  );
});

test("available collection play controls switch to pause before buffering", async () => {
  const [
    player,
    catalogCard,
    albumPage,
    artistPage,
    mediaCard,
    mediaDetail,
    playlistPage,
    quickPick,
  ] = await Promise.all([
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/CatalogCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/albums/[album].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/artists/[artist].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/MediaCollectionCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/MediaCollectionDetail.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/playlists/[playlist].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QuickPickTile.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    player,
    /async function toggleCollectionPlayback\([\s\S]*?playbackCollectionTarget\.value = target;[\s\S]*?playbackCollectionStarting\.value = true;[\s\S]*?playing\.value = true;[\s\S]*?loading\.value = true;[\s\S]*?const tracks = await load\(\);/,
    "Playback intent becomes active before collection data is awaited",
  );
  assert.match(
    player,
    /if \(playbackCollectionStarting\.value\) return;\s+const previousTrackId/,
    "Pending collection intent does not resume stale audio",
  );
  assert.match(
    player,
    /if \(playbackCollectionStarting\.value\) \{\s+cancelCollectionPlaybackStart\(\);\s+return;\s+\}/,
    "A pause action cancels a pending collection start",
  );

  for (const [name, source] of [
    ["catalog card", catalogCard],
    ["album page", albumPage],
    ["artist page", artistPage],
    ["media collection card", mediaCard],
    ["media collection detail", mediaDetail],
    ["quick pick", quickPick],
  ] as const) {
    assert.match(
      source,
      /toggleCollectionPlayback/,
      `${name} uses the shared immediate collection intent`,
    );
  }
  assert.match(
    playlistPage,
    /playCollection\(playableTracks\.value, track\.id, playlistTarget\.value\)/,
    "Playlist track playback binds the active playlist target",
  );
  assert.match(catalogCard, /playbackActive \? icons\.pause : icons\.play/);
  assert.match(albumPage, /albumPlaybackActive \? icons\.pause : icons\.play/);
  assert.match(
    artistPage,
    /artistPlaybackActive \? icons\.pause : icons\.play/,
  );
  assert.match(
    mediaCard,
    /collectionPlaybackActive \? icons\.pause : icons\.play/,
  );
  assert.match(
    mediaDetail,
    /collectionPlaybackActive \? icons\.pause : icons\.play/,
  );
  assert.match(quickPick, /isPlaybackTargetActive\(albumTarget\.value\)/);
});
