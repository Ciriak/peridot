import { useState } from "#imports";
import { computed, onMounted, onUnmounted } from "vue";
import { albums, toggleFavorite } from "../lib/demo-library";

export function useDemoPlayer() {
  const playing = useState("player-playing", () => false);
  const current = useState("player-current", () => 0);
  const elapsed = useState("player-elapsed", () => 0);
  const volume = useState("player-volume", () => 72);
  const liked = useState<number[]>("liked-tracks", () => [1, 3]);
  const active = computed(() => albums[current.value]!);
  function play(index: number) {
    current.value = index;
    elapsed.value = 0;
    playing.value = true;
  }
  function next(offset = 1) {
    play((current.value + offset + albums.length) % albums.length);
  }
  function toggleLike(index: number) {
    liked.value = toggleFavorite(liked.value, index);
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    timer = setInterval(() => {
      if (!playing.value) return;
      if (elapsed.value >= active.value.duration) next();
      else elapsed.value++;
    }, 1000);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });
  return {
    playing,
    current,
    elapsed,
    volume,
    liked,
    active,
    play,
    next,
    toggleLike,
  };
}
