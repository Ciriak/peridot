import assert from "node:assert/strict";
import { test } from "node:test";
import type { MetadataCandidateResponse } from "@peridot/contracts";
import {
  type AutomaticMatchResult,
  type MetadataResolver,
  MetadataResolverRegistry,
} from "../src/metadata-resolver.js";

class TestResolver implements MetadataResolver {
  readonly definition = {
    kind: "musicbrainz" as const,
    nameMessage: { key: "provider.musicbrainz.name" },
    descriptionMessage: {
      key: "provider.musicbrainz.description",
    },
    configurationFields: [],
    credentialField: null,
    supportsAutomaticMatching: true,
    supportsManualSearch: true,
  };

  normalizeConfiguration(): Record<string, string> {
    return {};
  }

  async validateCredential(): Promise<string> {
    return "test-account";
  }

  async findAlbumMatches(): Promise<Map<string, MetadataCandidateResponse[]>> {
    return new Map();
  }

  async findCandidates(): Promise<MetadataCandidateResponse[]> {
    return [];
  }

  automaticMatch(): AutomaticMatchResult {
    return { status: "unmatched" };
  }

  sourceUrl(): string {
    return "https://example.com";
  }
}

test("resolver registry exposes provider definitions without engine changes", () => {
  const resolver = new TestResolver();
  const registry = new MetadataResolverRegistry().register(resolver);

  assert.equal(registry.require("musicbrainz"), resolver);
  assert.deepEqual(registry.definitions(), [resolver.definition]);
  assert.throws(() => registry.register(resolver), /already registered/);
});
