export interface HealthResponse {
  status: "ok";
  service: "peridot";
}
export interface TrackReference {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  isrc?: string;
}
