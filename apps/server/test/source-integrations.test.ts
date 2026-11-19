import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceIntegrationDefinition } from "../src/source-integrations.js";
import {
  SourceIntegrationRegistry,
  SourceIntegrationService,
} from "../src/source-integrations.js";
import { CredentialStore } from "../src/credential-store.js";
import { createTestContext } from "./helpers.js";

function testIntegration(kind: string): SourceIntegrationDefinition {
  return {
    kind,
    async discover() {
      return [
        {
          id: "source-one",
          label: "Source One",
          configuration: { remoteId: "source-one" },
        },
      ];
    },
    async validateSource() {
      return {
        identity: "source-one",
        name: "Source One",
        configuration: { remoteId: "source-one" },
        credentials: { token: "secret" },
      };
    },
    async scan() {},
    async artwork() {
      return null;
    },
    async openAudio() {
      return new Response(null, { status: 204 });
    },
  };
}

test("built-in source registry dispatches to more than one integration", async () => {
  const registry = new SourceIntegrationRegistry([
    testIntegration("jellyfin"),
    testIntegration("future-source"),
  ]);
  const service = new SourceIntegrationService(registry, new CredentialStore());

  const options = await service.discover("future-source", {
    configuration: {},
    credentials: { token: "secret" },
  });

  assert.equal(options[0]?.label, "Source One");
  assert.equal(service.definition("future-source").kind, "future-source");
});

test("retired plugin endpoints are absent", async () => {
  const context = await createTestContext();
  try {
    for (const url of ["/api/admin/plugins", "/api/plugins/providers"]) {
      const response = await context.app.inject({
        method: "GET",
        url,
        headers: context.authorization,
      });
      assert.equal(response.statusCode, 404, url);
    }
  } finally {
    await context.close();
  }
});
