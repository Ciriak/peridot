import assert from "node:assert/strict";
import test from "node:test";
import type {
  MetadataProviderDefinitionResponse,
  MetadataProviderResponse,
} from "@peridot/contracts";
import { metadataProviderNeedsConfiguration } from "../app/lib/metadata-provider-config.ts";

const musicBrainzDefinition: MetadataProviderDefinitionResponse = {
  kind: "musicbrainz",
  name: "MusicBrainz",
  description: "Metadata",
  configurationFields: [
    {
      key: "contact",
      label: "Contact",
      type: "text",
      required: true,
      placeholder: null,
      helpText: null,
    },
  ],
  credentialField: null,
  supportsAutomaticMatching: true,
  supportsManualSearch: true,
};

const discogsDefinition: MetadataProviderDefinitionResponse = {
  ...musicBrainzDefinition,
  kind: "discogs",
  name: "Discogs",
  configurationFields: [],
  credentialField: {
    key: "token",
    label: "Token",
    type: "password",
    required: true,
    placeholder: null,
    helpText: null,
  },
};

function provider(
  overrides: Partial<MetadataProviderResponse>,
): MetadataProviderResponse {
  return {
    id: "provider-1",
    kind: "musicbrainz",
    name: "MusicBrainz",
    accountLabel: null,
    configuration: { contact: "owner@example.com" },
    hasCredential: false,
    enabled: true,
    ...overrides,
  };
}

test("enabled providers warn only when required configuration is missing", () => {
  const definitions = [musicBrainzDefinition, discogsDefinition];

  assert.equal(
    metadataProviderNeedsConfiguration(
      provider({ configuration: { contact: " " } }),
      definitions,
    ),
    true,
  );
  assert.equal(
    metadataProviderNeedsConfiguration(
      provider({ configuration: { contact: "owner@example.com" } }),
      definitions,
    ),
    false,
  );
  assert.equal(
    metadataProviderNeedsConfiguration(
      provider({ enabled: false, configuration: {} }),
      definitions,
    ),
    false,
  );
});

test("enabled keyed providers warn until their credential is stored", () => {
  const discogs = provider({
    kind: "discogs",
    name: "Discogs",
    configuration: {},
  });
  const definitions = [musicBrainzDefinition, discogsDefinition];

  assert.equal(metadataProviderNeedsConfiguration(discogs, definitions), true);
  assert.equal(
    metadataProviderNeedsConfiguration(
      { ...discogs, hasCredential: true },
      definitions,
    ),
    false,
  );
});
