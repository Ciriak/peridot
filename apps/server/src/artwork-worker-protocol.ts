export interface ArtworkTransformRequest {
  id: number;
  data: Uint8Array;
}

export interface ArtworkTransformResult {
  data: Uint8Array;
  height: number;
  width: number;
}

export type ArtworkTransformResponse =
  | {
      id: number;
      ok: true;
      result: ArtworkTransformResult;
    }
  | {
      error: string;
      id: number;
      ok: false;
    };
