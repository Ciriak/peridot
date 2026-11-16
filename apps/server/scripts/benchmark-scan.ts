import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { runPendingMigrations } from "./migrate-database.js";
import { createTestContext, createWav } from "../test/helpers.js";

interface BenchmarkResult {
  workers: number;
  files: number;
  scanMs: number;
  healthRequests: number;
  healthP95Ms: number;
  healthMaxMs: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
}

function argumentValues(name: string): string[] {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return [];
  const values: string[] = [];
  for (
    let cursor = index + 1;
    cursor < process.argv.length && !process.argv[cursor]!.startsWith("--");
    cursor += 1
  ) {
    values.push(process.argv[cursor]!);
  }
  return values;
}

function argument(name: string, fallback: string): string {
  return argumentValues(name)[0] ?? fallback;
}

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0
  );
}

async function benchmark(
  templatePath: string,
  files: number,
  workers: number,
): Promise<BenchmarkResult> {
  process.env.PERIDOT_TEST_DB_TEMPLATE = templatePath;
  const context = await createTestContext();
  try {
    await context.database.orm.MetadataProvider.where({ enabled: 1 }).update({
      enabled: 0,
    });
    await context.database.orm.ServerSetting.where({ id: "server" }).update({
      scanWorkerCount: workers,
    });
    const payload = createWav(250);
    const albumCount = Math.ceil(files / 20);
    for (let album = 0; album < albumCount; album += 1) {
      const directory = path.join(
        context.libraryRoot,
        `Album ${String(album).padStart(3, "0")}`,
      );
      await mkdir(directory, { recursive: true });
      await Promise.all(
        Array.from({ length: Math.min(20, files - album * 20) }, (_, index) =>
          writeFile(
            path.join(
              directory,
              `${String(album * 20 + index).padStart(5, "0")}.wav`,
            ),
            payload,
          ),
        ),
      );
    }

    const scan = await context.app.inject({
      method: "POST",
      url: "/api/library/scans",
      headers: context.authorization,
    });
    if (scan.statusCode !== 202) throw new Error(scan.body);
    const taskId = scan.json<{ id: string }>().id;
    const healthLatency: number[] = [];
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    const started = performance.now();
    while (true) {
      const requestStarted = performance.now();
      const health = await context.app.inject({
        method: "GET",
        url: "/api/health",
      });
      if (health.statusCode !== 200) throw new Error(health.body);
      healthLatency.push(performance.now() - requestStarted);
      const taskResponse = await context.app.inject({
        method: "GET",
        url: `/api/tasks/${taskId}`,
        headers: context.authorization,
      });
      const status = taskResponse.json<{ status: string }>().status;
      if (!["queued", "running"].includes(status)) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    histogram.disable();
    return {
      workers,
      files,
      scanMs: Math.round(performance.now() - started),
      healthRequests: healthLatency.length,
      healthP95Ms: Number(percentile(healthLatency, 0.95).toFixed(2)),
      healthMaxMs: Number(percentile(healthLatency, 1).toFixed(2)),
      eventLoopP99Ms: Number((histogram.percentile(99) / 1e6).toFixed(2)),
      eventLoopMaxMs: Number((histogram.max / 1e6).toFixed(2)),
    };
  } finally {
    await context.close();
  }
}

const requestedFiles = Number(argument("files", "100"));
const files = Number.isSafeInteger(requestedFiles)
  ? Math.max(1, requestedFiles)
  : 100;
const workerValues = argumentValues("workers");
const workerCounts = (workerValues.length ? workerValues : ["1,3,4,8"])
  .flatMap((value) => value.split(/[\s,]+/))
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value > 0);
if (!workerCounts.length) workerCounts.push(1, 3, 4, 8);
const root = await mkdtemp(path.join(tmpdir(), "peridot-scan-benchmark-"));
const templatePath = path.join(root, "template.db");
try {
  await runPendingMigrations({
    databaseUrl: `file:${templatePath.replaceAll("\\", "/")}`,
    info: () => undefined,
  });
  const results: BenchmarkResult[] = [];
  for (const workers of workerCounts) {
    results.push(await benchmark(templatePath, files, workers));
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
