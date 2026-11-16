export const AUDIO_MIME_TYPES = new Map([
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".m4b", "audio/mp4"],
  [".aac", "audio/aac"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
  [".flac", "audio/flac"],
]);

export interface ScanDirectoryAudioFile {
  absolutePath: string;
  mimeType: string;
  size: string;
  modifiedAtMs: number;
}

export interface ScanDirectoryResult {
  directories: string[];
  audioFiles: ScanDirectoryAudioFile[];
}

export interface ScanWorkerCover {
  data: Uint8Array;
  mimeType: string;
}

export interface ScanWorkerMetadata {
  container: string;
  title: string | null;
  artists: string[];
  artist: string | null;
  albumArtists: string[];
  albumArtist: string | null;
  album: string | null;
  genres: string[];
  discNumber: number | null;
  trackNumber: number | null;
  durationSeconds: number | null;
  releasedate: string | null;
  originaldate: string | null;
  date: string | null;
  year: number | null;
  podcast: boolean;
  podcastId: string | null;
  podcastUrl: string | null;
  releaseTypes: string[];
  iTunesMediaType: number;
  cover: ScanWorkerCover | null;
}

export type ScanWorkerRequest =
  | {
      id: number;
      type: "listDirectory";
      directory: string;
    }
  | {
      id: number;
      type: "parseFile";
      filePath: string;
    };

export type ScanWorkerPayload =
  | Omit<Extract<ScanWorkerRequest, { type: "listDirectory" }>, "id">
  | Omit<Extract<ScanWorkerRequest, { type: "parseFile" }>, "id">;

export type ScanWorkerResponse =
  | {
      id: number;
      ok: true;
      type: "listDirectory";
      result: ScanDirectoryResult;
    }
  | {
      id: number;
      ok: true;
      type: "parseFile";
      result: ScanWorkerMetadata;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };
