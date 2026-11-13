export type WebMediaSessionAction =
  "nexttrack" | "pause" | "play" | "previoustrack" | "seekto";

export interface WebMediaSessionActions {
  next: () => void;
  pause: () => void;
  play: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
}

export function configureWebMediaSession(
  mediaSession: Pick<MediaSession, "setActionHandler">,
  actions: WebMediaSessionActions,
): () => void {
  const handlers: Record<WebMediaSessionAction, MediaSessionActionHandler> = {
    nexttrack: actions.next,
    pause: actions.pause,
    play: actions.play,
    previoustrack: actions.previous,
    seekto: (details) => {
      if (typeof details.seekTime === "number") {
        actions.seek(details.seekTime);
      }
    },
  };

  for (const [action, handler] of Object.entries(handlers)) {
    try {
      mediaSession.setActionHandler(action as WebMediaSessionAction, handler);
    } catch {
      // Browsers may expose Media Session without every action.
    }
  }

  return () => {
    for (const action of Object.keys(handlers) as WebMediaSessionAction[]) {
      try {
        mediaSession.setActionHandler(action, null);
      } catch {
        // Ignore unsupported actions during cleanup.
      }
    }
  };
}
