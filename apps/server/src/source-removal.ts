import { randomUUID } from "node:crypto";
import type {
  SourceRemovalPhase,
  SourceRemovalProgressResponse,
} from "@peridot/contracts";

export class SourceRemovalError extends Error {
  constructor(
    readonly code: "source_removal_in_progress",
    message: string,
  ) {
    super(message);
    this.name = "SourceRemovalError";
  }
}

export class SourceRemovalRegistry {
  private readonly active = new Map<string, SourceRemovalProgressResponse>();

  constructor(
    private readonly publish: (
      progress: SourceRemovalProgressResponse,
    ) => void,
  ) {}

  start(
    sourceId: string,
    total: number,
  ): SourceRemovalProgressResponse {
    if (this.active.has(sourceId)) {
      throw new SourceRemovalError(
        "source_removal_in_progress",
        "This source is already being removed.",
      );
    }
    const progress = {
      operationId: randomUUID(),
      sourceId,
      phase: "stopping" as const,
      completed: 0,
      total,
    };
    this.active.set(sourceId, progress);
    this.publish(progress);
    return progress;
  }

  update(
    sourceId: string,
    phase: SourceRemovalPhase,
    completed: number,
    total: number,
  ): SourceRemovalProgressResponse | null {
    const current = this.active.get(sourceId);
    if (!current) return null;
    const progress = {
      ...current,
      phase,
      completed: Math.max(0, completed),
      total: Math.max(0, total),
    };
    this.active.set(sourceId, progress);
    this.publish(progress);
    return progress;
  }

  finish(sourceId: string): void {
    this.active.delete(sourceId);
  }

  get(sourceId: string): SourceRemovalProgressResponse | null {
    return this.active.get(sourceId) ?? null;
  }
}
