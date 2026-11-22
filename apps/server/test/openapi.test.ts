import assert from "node:assert/strict";
import test from "node:test";
import { APPLICATION_PLUGIN_TIMEOUT_MS } from "../src/app.js";
import { openApiRouteKeys } from "../src/openapi.js";
import { createTestContext } from "./helpers.js";

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  responses?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
  requestBody?: unknown;
  "x-peridot-doc-fallback"?: boolean;
}

interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, OpenApiPathItem>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
  head?: OpenApiOperation;
}

const httpMethods = ["get", "post", "put", "patch", "delete", "head"] as const;

function collectSchemaReferences(value: unknown, references: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaReferences(item, references);
    return references;
  }
  if (!value || typeof value !== "object") return references;
  for (const [key, child] of Object.entries(value)) {
    if (
      key === "$ref" &&
      typeof child === "string" &&
      child.startsWith("#/components/schemas/")
    ) {
      references.push(child.slice("#/components/schemas/".length));
    } else {
      collectSchemaReferences(child, references);
    }
  }
  return references;
}

test("OpenAPI endpoints publish every documented API route", async () => {
  const context = await createTestContext();
  try {
    assert.equal(
      context.app.initialConfig.pluginTimeout,
      APPLICATION_PLUGIN_TIMEOUT_MS,
    );
    const response = await context.app.inject({
      method: "GET",
      url: "/api/openapi.json",
    });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"]), /application\/json/);
    assert.equal(response.headers["cache-control"], "no-cache");

    const document = response.json<OpenApiDocument>();
    assert.equal(document.openapi, "3.1.0");
    assert.equal(document.info.title, "Peridot API");
    assert.match(document.info.version, /^\d+\.\d+\.\d+$/);

    const operations = Object.entries(document.paths).flatMap(
      ([path, pathItem]) =>
        httpMethods.flatMap((method) => {
          const operation = pathItem[method];
          return operation ? [{ path, method, operation }] : [];
        }),
    );

    assert.equal(operations.length, openApiRouteKeys.length);
    for (const { path, method, operation } of operations) {
      assert.ok(path.startsWith("/api/"), `${method} ${path}`);
      assert.ok(operation.operationId, `${method} ${path} operationId`);
      assert.ok(operation.summary, `${method} ${path} summary`);
      assert.ok(operation.tags?.length, `${method} ${path} tags`);
      assert.ok(
        Object.keys(operation.responses ?? {}).length > 0,
        `${method} ${path} responses`,
      );
      assert.equal(
        operation["x-peridot-doc-fallback"],
        undefined,
        `${method} ${path} has a handwritten route entry`,
      );
    }

    for (const routeKey of openApiRouteKeys) {
      const [method, path] = routeKey.split(" ", 2) as [string, string];
      const openApiPath = path.replace(/:([A-Za-z0-9_]+)/gu, "{$1}");
      assert.ok(
        document.paths[openApiPath]?.[
          method.toLowerCase() as keyof OpenApiPathItem
        ],
        `${routeKey} is present in the generated document`,
      );
    }

    assert.deepEqual(document.paths["/api/health"]?.get?.security, []);
    assert.deepEqual(document.paths["/api/tracks"]?.get?.security, [
      { bearerAuth: [] },
    ]);
    assert.ok(
      document.paths["/api/tracks/{id}/audio"]?.get?.security?.some(
        (requirement) => "playbackToken" in requirement,
      ),
    );
    assert.ok(document.paths["/api/tracks/resolve"]?.post?.requestBody);
    assert.equal(document.paths["/api/openapi.json"], undefined);
    assert.equal(document.paths["/api/docs"], undefined);

    assert.ok(document.components.securitySchemes.bearerAuth);
    assert.ok(document.components.schemas.TrackResponse);
    const trackSchema = document.components.schemas.TrackResponse as {
      properties?: Record<string, unknown>;
    };
    assert.ok(trackSchema.properties?.sourceKind);
    const albumSchema = document.components.schemas.AlbumSummaryResponse as {
      properties?: Record<string, unknown>;
    };
    assert.ok(albumSchema.properties?.sourceKinds);
    assert.ok(document.components.schemas.ApiErrorResponse);

    const references = collectSchemaReferences(document);
    assert.ok(references.length > 0);
    for (const name of references) {
      assert.ok(document.components.schemas[name], `Missing schema ${name}`);
    }
  } finally {
    await context.close();
  }
});

test("OpenAPI YAML and Swagger UI are available", async () => {
  const context = await createTestContext();
  try {
    const yaml = await context.app.inject({
      method: "GET",
      url: "/api/openapi.yaml",
    });
    assert.equal(yaml.statusCode, 200);
    assert.match(String(yaml.headers["content-type"]), /application\/yaml/);
    assert.match(yaml.body, /openapi: 3\.1\.0/);

    const docs = await context.app.inject({
      method: "GET",
      url: "/api/docs/",
    });
    assert.equal(docs.statusCode, 200);
    assert.match(String(docs.headers["content-type"]), /text\/html/);

    const initializer = await context.app.inject({
      method: "GET",
      url: "/api/docs/static/swagger-initializer.js",
    });
    assert.equal(initializer.statusCode, 200);
    assert.match(initializer.body, /\/api\/openapi\.json/);
  } finally {
    await context.close();
  }
});
