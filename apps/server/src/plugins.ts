import type {
  PluginContributionResponse,
  PluginListResponse,
  PluginProviderListResponse,
  PluginProviderResponse,
  PluginRecommendationCandidate,
  PluginResponse,
  PluginSettingsResponse,
  PluginSourceOptionResponse,
  PluginTrackReference,
  UpdatePluginEnabledRequest,
  TaskKind,
  TaskResponse,
  UpdatePluginSettingsRequest,
} from "@peridot/contracts";
import {
  PluginError,
  type PluginConfiguration,
  type PluginDefinition,
  type PluginInstallation,
  type PluginSourceConfiguration,
  type PluginSourceHandle,
} from "@peridot/plugin-sdk";
import type { CatalogService } from "./catalog.js";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import { message } from "./messages.js";
import type { PluginInstallationRow, SourceRow } from "./prisma/models.js";
import {
  TaskExecutionError,
  toTaskResponse,
  type TaskExecutionResult,
  type TaskService,
} from "./tasks.js";

const MAX_CONFIGURATION_ENTRIES = 64;
const MAX_CONFIGURATION_KEY_LENGTH = 80;
const MAX_CONFIGURATION_VALUE_LENGTH = 4096;
const PLUGIN_JOB_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function configurationValue(value: string | null): PluginSourceConfiguration {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
        .slice(0, MAX_CONFIGURATION_ENTRIES),
    );
  } catch {
    return {};
  }
}

function safeConfiguration(
  fields: readonly { key: string; secret: boolean }[],
  configuration: PluginSourceConfiguration,
): PluginSourceConfiguration {
  const secretKeys = new Set(
    fields.filter((field) => field.secret).map((field) => field.key),
  );
  return Object.fromEntries(
    Object.entries(configuration).filter(([key]) => !secretKeys.has(key)),
  );
}

function settingsResponse(
  definition: PluginDefinition,
  row: {
    configuration: string;
    credentialCiphertext: string | null;
  } | null,
  credentials: CredentialStore,
): PluginSettingsResponse {
  const fields = [...(definition.settingsFields ?? [])];
  const configuration = row ? configurationValue(row.configuration) : {};
  const secretConfiguration =
    row?.credentialCiphertext && credentials.configured
      ? configurationValue(
          credentials.decrypt(row.credentialCiphertext, "plugin"),
        )
      : {};
  return {
    fields,
    configuration: safeConfiguration(fields, configuration),
    configured: fields.every((field) => {
      const value = field.secret
        ? secretConfiguration[field.key]
        : configuration[field.key];
      return !field.required || Boolean(value?.trim());
    }),
  };
}

function boundedConfiguration(value: unknown): PluginConfiguration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_CONFIGURATION_ENTRIES) return null;
  const result: PluginConfiguration = {};
  for (const [key, item] of entries) {
    if (
      typeof item !== "string" ||
      !key ||
      key.length > MAX_CONFIGURATION_KEY_LENGTH ||
      item.length > MAX_CONFIGURATION_VALUE_LENGTH
    ) {
      return null;
    }
    result[key] = item;
  }
  return result;
}

function validateConfiguration(
  definition: PluginDefinition,
  configuration: PluginConfiguration,
  credentialConfiguration: PluginConfiguration,
): void {
  const fields = definition.settingsFields ?? [];
  const known = new Map(fields.map((field) => [field.key, field]));
  for (const key of Object.keys(configuration)) {
    if (known.get(key)?.secret) {
      throw new PluginError(
        `Secret setting ${key} must be sent as a credential.`,
        "invalid_configuration",
      );
    }
    if (!known.has(key)) {
      throw new PluginError(
        `Unknown plugin setting: ${key}.`,
        "invalid_configuration",
      );
    }
  }
  for (const key of Object.keys(credentialConfiguration)) {
    if (!known.get(key)?.secret) {
      throw new PluginError(
        `Unknown plugin credential: ${key}.`,
        "invalid_configuration",
      );
    }
  }
  for (const field of fields) {
    const value = field.secret
      ? credentialConfiguration[field.key]
      : configuration[field.key];
    if (field.required && !value?.trim()) {
      throw new PluginError(
        `Plugin setting ${field.key} is required.`,
        "invalid_configuration",
      );
    }
  }
}

function normalizeCandidates(
  candidates: readonly PluginRecommendationCandidate[],
): PluginRecommendationCandidate[] {
  if (candidates.length > 100) {
    throw new PluginError(
      "The plugin returned too many recommendation candidates.",
      "invalid_response",
      502,
    );
  }
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    const sourceId = candidate.sourceId?.trim();
    const externalId = candidate.externalId?.trim();
    if (
      !sourceId ||
      !externalId ||
      sourceId.length > 200 ||
      externalId.length > 1024
    ) {
      throw new PluginError(
        "The plugin returned an invalid track reference.",
        "invalid_response",
        502,
      );
    }
    const key = JSON.stringify([sourceId, externalId]);
    if (seen.has(key)) return [];
    seen.add(key);
    const score =
      candidate.score !== null && Number.isFinite(candidate.score)
        ? candidate.score
        : null;
    const reason = candidate.reason?.trim().slice(0, 300) || null;
    return [{ sourceId, externalId, score, reason }];
  });
}

function contributionResponses(
  definition: PluginDefinition,
): PluginContributionResponse[] {
  return definition.contributions.map((contribution) => {
    if (contribution.kind === "source") {
      return {
        kind: "source",
        configurationFields: contribution.configurationFields.map((field) => ({
          ...field,
        })),
        discovery: contribution.discovery
          ? { ...contribution.discovery }
          : null,
      };
    }
    if (contribution.kind === "recommendation-provider") {
      return {
        kind: "recommendation-provider",
        methods: [...contribution.methods],
      };
    }
    if (contribution.kind === "playlist-generator") {
      return {
        kind: "playlist-generator",
        supportsPrompt: contribution.supportsPrompt,
        supportsSeed: contribution.supportsSeed,
      };
    }
    if (contribution.kind === "data-processor") {
      return {
        kind: "data-processor",
        tasks: contribution.tasks.map((task) => ({ ...task })),
      };
    }
    return { kind: "display" };
  });
}

function installationRow(
  definition: PluginDefinition,
  row: PluginInstallationRow | null,
): PluginInstallation {
  return {
    pluginId: definition.manifest.id,
    installed: row?.installed === 1,
    installedAt: row?.installedAt ?? null,
    installSource: row?.installSource === "github" ? "github" : "bundled",
    installSourceLocator:
      row?.installSourceLocator ?? definition.manifest.installSourceLocator,
    version: row?.version ?? definition.manifest.version,
  };
}

export class PluginService {
  private readonly definitions = new Map<string, PluginDefinition>();
  private readonly activePlugins = new Set<string>();

  constructor(
    private readonly database: Database,
    private readonly credentials: CredentialStore,
    definitions: readonly PluginDefinition[],
  ) {
    for (const definition of definitions) {
      if (definition.manifest.sdkVersion !== "1") {
        throw new Error(
          `Unsupported plugin SDK version for ${definition.manifest.id}: ${definition.manifest.sdkVersion}`,
        );
      }
      if (this.definitions.has(definition.manifest.id)) {
        throw new Error(`Duplicate plugin id: ${definition.manifest.id}`);
      }
      const declaredKinds = new Set(definition.manifest.contributionKinds);
      const contributionKinds = new Set(
        definition.contributions.map((contribution) => contribution.kind),
      );
      if (
        declaredKinds.size !== contributionKinds.size ||
        [...declaredKinds].some((kind) => !contributionKinds.has(kind))
      ) {
        throw new Error(
          `Plugin ${definition.manifest.id} contribution kinds do not match its contributions.`,
        );
      }
      const sourceContribution = definition.contributions.some(
        (contribution) => contribution.kind === "source",
      );
      if (sourceContribution !== Boolean(definition.source)) {
        throw new Error(
          `Plugin ${definition.manifest.id} must declare and implement its source contribution together.`,
        );
      }
      const recommendationContribution = definition.contributions.find(
        (contribution) => contribution.kind === "recommendation-provider",
      );
      if (
        Boolean(recommendationContribution) !==
        Boolean(definition.recommendationProvider)
      ) {
        throw new Error(
          `Plugin ${definition.manifest.id} must declare and implement its recommendation contribution together.`,
        );
      }
      if (
        recommendationContribution?.kind === "recommendation-provider" &&
        definition.recommendationProvider
      ) {
        if (!recommendationContribution.methods.length) {
          throw new Error(
            `Plugin ${definition.manifest.id} must advertise a recommendation method.`,
          );
        }
        for (const method of recommendationContribution.methods) {
          const adapterMethod =
            method === "similar"
              ? definition.recommendationProvider.similar
              : definition.recommendationProvider.forYou;
          if (!adapterMethod) {
            throw new Error(
              `Plugin ${definition.manifest.id} does not implement recommendation method ${method}.`,
            );
          }
        }
      }
      const playlistContribution = definition.contributions.some(
        (contribution) => contribution.kind === "playlist-generator",
      );
      if (playlistContribution !== Boolean(definition.playlistGenerator)) {
        throw new Error(
          `Plugin ${definition.manifest.id} must declare and implement its playlist-generator contribution together.`,
        );
      }
      const dataContribution = definition.contributions.find(
        (contribution) => contribution.kind === "data-processor",
      );
      if (Boolean(dataContribution) !== Boolean(definition.dataProcessor)) {
        throw new Error(
          `Plugin ${definition.manifest.id} must declare and implement its data-processor contribution together.`,
        );
      }
      if (
        dataContribution?.kind === "data-processor" &&
        definition.dataProcessor
      ) {
        const declaredTasks = dataContribution.tasks.map((task) => task.id);
        const implementedTasks = definition.dataProcessor.tasks.map(
          (task) => task.contribution.id,
        );
        if (
          new Set(declaredTasks).size !== declaredTasks.length ||
          new Set(implementedTasks).size !== implementedTasks.length ||
          declaredTasks.length !== implementedTasks.length ||
          declaredTasks.some(
            (id, index) =>
              !PLUGIN_JOB_ID.test(id) || id !== implementedTasks[index],
          )
        ) {
          throw new Error(
            `Plugin ${definition.manifest.id} data-processor tasks do not match its contributions.`,
          );
        }
      }
      const settingKeys = new Set<string>();
      for (const field of definition.settingsFields ?? []) {
        if (
          !field.key ||
          field.key.length > MAX_CONFIGURATION_KEY_LENGTH ||
          settingKeys.has(field.key)
        ) {
          throw new Error(
            `Plugin ${definition.manifest.id} has invalid or duplicate setting fields.`,
          );
        }
        settingKeys.add(field.key);
      }
      this.definitions.set(definition.manifest.id, definition);
    }
  }

  async initialize(): Promise<void> {
    for (const definition of this.definitions.values()) {
      const existing = await this.database.orm.PluginInstallation.first({
        pluginId: definition.manifest.id,
      });
      if (existing) continue;
      const now = new Date();
      await this.database.orm.PluginInstallation.create({
        pluginId: definition.manifest.id,
        installed: 1,
        enabled: 1,
        installedAt: now,
        installSource: definition.manifest.installSource,
        installSourceLocator: definition.manifest.installSourceLocator,
        version: definition.manifest.version,
      });
    }
    const rows = await this.database.orm.PluginInstallation.all();
    this.activePlugins.clear();
    for (const row of rows) {
      if (row.installed === 1 && row.enabled === 1) {
        this.activePlugins.add(row.pluginId);
      }
    }
  }

  registerTaskExecutors(tasks: TaskService): void {
    for (const definition of this.definitions.values()) {
      for (const pluginTask of definition.dataProcessor?.tasks ?? []) {
        const kind =
          `plugin:${definition.manifest.id}:${pluginTask.contribution.id}` as TaskKind;
        tasks.registerExecutor(kind, async (task, taskService, signal) => {
          const installed = await this.requireEnabled(definition.manifest.id);
          const currentTask = installed.dataProcessor?.tasks.find(
            (candidate) =>
              candidate.contribution.id === pluginTask.contribution.id,
          );
          if (!currentTask) {
            throw new TaskExecutionError(
              `Plugin task ${pluginTask.contribution.id} is no longer available.`,
            );
          }
          try {
            const runtime = await this.runtimeConfiguration(installed);
            const result = await currentTask.run({
              ...runtime,
              signal,
              progress: {
                update: (completed, total, details) =>
                  taskService.updateProgress(
                    task.id,
                    completed,
                    total,
                    details,
                  ),
              },
            });
            return {
              ...(result?.details ? { details: [...result.details] } : {}),
              ...(result?.failureSummary !== undefined
                ? { failureSummary: result.failureSummary }
                : {}),
            } satisfies TaskExecutionResult;
          } catch (error) {
            if (error instanceof PluginError) {
              throw new TaskExecutionError(
                error.message,
                "failed",
                error.messageDescriptor,
              );
            }
            throw error;
          }
        });
      }
    }
  }

  async enqueueTask(
    pluginId: string,
    taskId: string,
    tasks: TaskService,
  ): Promise<TaskResponse> {
    const definition = await this.requireEnabled(pluginId);
    const pluginTask = definition.dataProcessor?.tasks.find(
      (candidate) => candidate.contribution.id === taskId,
    );
    if (!pluginTask) {
      throw new PluginError(
        "Plugin task not found.",
        "invalid_configuration",
        404,
      );
    }
    await this.runtimeConfiguration(definition);
    const task = await tasks.enqueue({
      kind: `plugin:${definition.manifest.id}:${pluginTask.contribution.id}` as TaskKind,
      title: `${definition.manifest.name} ${pluginTask.contribution.id}`,
      titleMessage: pluginTask.contribution.titleMessage,
    });
    return toTaskResponse(task);
  }

  async list(): Promise<PluginListResponse> {
    const rows = await this.database.orm.PluginInstallation.all();
    const byId = new Map(rows.map((row) => [row.pluginId, row]));
    return {
      items: [...this.definitions.values()].map((definition) => {
        const installation = installationRow(
          definition,
          byId.get(definition.manifest.id) ?? null,
        );
        const row = byId.get(definition.manifest.id) ?? null;
        return this.toResponse(definition, installation, row);
      }),
    };
  }

  async providers(): Promise<PluginProviderListResponse> {
    const rows = await this.database.orm.PluginInstallation.where({
      installed: 1,
    }).all();
    const byId = new Map(rows.map((row) => [row.pluginId, row]));
    return {
      items: [...this.definitions.values()].flatMap((definition) => {
        const row = byId.get(definition.manifest.id);
        const recommendation = definition.contributions.find(
          (contribution) => contribution.kind === "recommendation-provider",
        );
        const playlistGeneration = definition.contributions.some(
          (contribution) => contribution.kind === "playlist-generator",
        );
        if (
          !row ||
          !this.activePlugins.has(definition.manifest.id) ||
          (!recommendation && !playlistGeneration)
        ) {
          return [];
        }
        const response: PluginProviderResponse = {
          id: definition.manifest.id,
          name: definition.manifest.name,
          descriptionMessage: definition.manifest.descriptionMessage,
          version: row.version,
          recommendationMethods:
            recommendation?.kind === "recommendation-provider"
              ? [...recommendation.methods]
              : [],
          playlistGeneration,
          configured: settingsResponse(definition, row, this.credentials)
            .configured,
        };
        return [response];
      }),
    };
  }

  async settings(pluginId: string): Promise<PluginSettingsResponse> {
    const definition = this.definition(pluginId);
    const row = await this.database.orm.PluginInstallation.first({ pluginId });
    return settingsResponse(definition, row, this.credentials);
  }

  async updateSettings(
    pluginId: string,
    input: UpdatePluginSettingsRequest,
  ): Promise<PluginResponse> {
    const definition = await this.requireInstalled(pluginId);
    const row = await this.database.orm.PluginInstallation.firstOrThrow({
      pluginId,
    });
    const configuration = boundedConfiguration(input.configuration);
    if (!configuration) {
      throw new PluginError(
        "Invalid plugin configuration.",
        "invalid_configuration",
      );
    }
    const credentialsChanged = input.credentials !== undefined;
    const suppliedCredentials = credentialsChanged
      ? boundedConfiguration(input.credentials)
      : configurationValue(
          row.credentialCiphertext
            ? this.credentials.decrypt(row.credentialCiphertext, "plugin")
            : null,
        );
    if (!suppliedCredentials) {
      throw new PluginError(
        "Invalid plugin credentials.",
        "invalid_configuration",
      );
    }
    validateConfiguration(definition, configuration, suppliedCredentials);
    const credentialCiphertext = credentialsChanged
      ? Object.keys(suppliedCredentials).length
        ? this.credentials.encrypt(
            JSON.stringify(suppliedCredentials),
            "plugin",
          )
        : null
      : row.credentialCiphertext;
    await this.database.orm.PluginInstallation.where({ pluginId }).update({
      configuration: JSON.stringify(configuration),
      credentialCiphertext,
    });
    const updated = await this.database.orm.PluginInstallation.firstOrThrow({
      pluginId,
    });
    return this.toResponse(
      definition,
      installationRow(definition, updated),
      updated,
    );
  }

  async requireInstalled(pluginId: string): Promise<PluginDefinition> {
    const definition = this.definition(pluginId);
    const row = await this.database.orm.PluginInstallation.first({ pluginId });
    if (row?.installed !== 1) {
      throw new PluginError(
        "The plugin is not installed.",
        "not_installed",
        409,
      );
    }
    return definition;
  }

  async install(pluginId: string): Promise<PluginResponse> {
    const definition = this.definition(pluginId);
    const now = new Date();
    const existing = await this.database.orm.PluginInstallation.first({
      pluginId,
    });
    const update = {
      installed: 1,
      enabled: 1,
      installedAt: now,
      installSource: definition.manifest.installSource,
      installSourceLocator: definition.manifest.installSourceLocator,
      version: definition.manifest.version,
    };
    if (existing) {
      await this.database.orm.PluginInstallation.where({ pluginId }).update(
        update,
      );
    } else {
      await this.database.orm.PluginInstallation.create({
        pluginId,
        ...update,
      });
    }
    const row = await this.database.orm.PluginInstallation.firstOrThrow({
      pluginId,
    });
    return this.toResponse(definition, installationRow(definition, row), row);
  }

  async updateEnabled(
    pluginId: string,
    input: UpdatePluginEnabledRequest,
  ): Promise<PluginResponse> {
    if (typeof input?.enabled !== "boolean") {
      throw new PluginError(
        "Plugin enabled state must be true or false.",
        "invalid_configuration",
        400,
      );
    }
    const definition = await this.requireInstalled(pluginId);
    await this.database.orm.PluginInstallation.where({ pluginId }).update({
      enabled: input.enabled ? 1 : 0,
    });
    const row = await this.database.orm.PluginInstallation.firstOrThrow({
      pluginId,
    });
    return this.toResponse(definition, installationRow(definition, row), row);
  }

  async uninstall(
    pluginId: string,
    tasks: TaskService,
    catalog: CatalogService,
    confirmation: unknown,
  ): Promise<PluginResponse> {
    if (confirmation !== true) {
      throw new PluginError(
        "Confirm that plugin data should be removed.",
        "confirmation_required",
        400,
      );
    }
    const definition = await this.requireInstalled(pluginId);
    const sources = await this.database.orm.Source.where({ pluginId }).all();
    const sourceIds = new Set(sources.map((source) => source.id));
    const activeTasks = await this.database.orm.Task.where((task) =>
      task.status.in(["queued", "running"]),
    ).all();
    for (const task of activeTasks) {
      if (
        (task.sourceId && sourceIds.has(task.sourceId)) ||
        task.kind.startsWith(`plugin:${pluginId}:`)
      ) {
        await tasks.stop(task.id);
      }
    }

    const tracks = sourceIds.size
      ? await this.database.orm.Track.where((track) =>
          track.sourceId.in([...sourceIds]),
        ).all()
      : [];
    const trackIds = tracks.map((track) => track.id);
    if (trackIds.length) {
      await this.database.orm.PlaylistItem.where((item) =>
        item.trackId.in(trackIds),
      ).deleteAndCount();
      for (const trackId of trackIds) {
        await catalog.removeTrack(trackId);
      }
    }

    const pluginTaskIds = (await this.database.orm.Task.all()).flatMap(
      (task) => (task.kind.startsWith(`plugin:${pluginId}:`) ? [task.id] : []),
    );
    await this.database.transaction(async (transaction) => {
      if (sourceIds.size) {
        await transaction.orm.Task.where((task) =>
          task.sourceId.in([...sourceIds]),
        ).deleteAndCount();
      }
      if (pluginTaskIds.length) {
        await transaction.orm.Task.where((task) =>
          task.id.in(pluginTaskIds),
        ).deleteAndCount();
      }
      if (trackIds.length) {
        await transaction.orm.Track.where((track) =>
          track.id.in(trackIds),
        ).deleteAndCount();
      }
      await transaction.orm.Source.where({ pluginId }).deleteAndCount();
      await transaction.orm.PluginInstallation.where({ pluginId }).update({
        installed: 0,
        enabled: 0,
        installedAt: null,
        configuration: "{}",
        credentialCiphertext: null,
      });
    });
    await this.removeUnusedCovers(
      tracks.flatMap((track) => (track.coverId ? [track.coverId] : [])),
    );
    await catalog.flushChanges();
    this.activePlugins.delete(pluginId);
    const row = await this.database.orm.PluginInstallation.firstOrThrow({
      pluginId,
    });
    return this.toResponse(definition, installationRow(definition, row), row);
  }

  async discoverSources(
    pluginId: string,
    configuration: PluginSourceConfiguration,
    signal?: AbortSignal,
  ): Promise<PluginSourceOptionResponse[]> {
    const definition = await this.requireEnabled(pluginId);
    if (!definition.source) {
      throw new PluginError(
        "This plugin does not provide library sources.",
        "invalid_configuration",
        400,
      );
    }
    return definition.source.discover({
      configuration,
      ...(signal ? { signal } : {}),
    });
  }

  async validateSource(
    pluginId: string,
    configuration: PluginSourceConfiguration,
    signal?: AbortSignal,
  ) {
    const definition = await this.requireEnabled(pluginId);
    if (!definition.source) {
      throw new PluginError(
        "This plugin does not provide library sources.",
        "invalid_configuration",
        400,
      );
    }
    return definition.source.validateSource({
      configuration,
      ...(signal ? { signal } : {}),
    });
  }

  async sourceAdapter(source: SourceRow) {
    if (source.kind !== "plugin" || !source.pluginId) return null;
    const definition = await this.requireEnabled(source.pluginId);
    return definition.source ?? null;
  }

  async similarTracks(
    pluginId: string,
    seed: PluginTrackReference,
    limit: number,
    signal?: AbortSignal,
  ): Promise<PluginRecommendationCandidate[]> {
    const definition = await this.requireEnabled(pluginId);
    const provider = definition.recommendationProvider;
    if (!provider?.similar) {
      throw new PluginError(
        "This plugin does not provide similar-track recommendations.",
        "unsupported",
        400,
      );
    }
    const runtime = await this.runtimeConfiguration(definition);
    return normalizeCandidates(
      await provider.similar({
        ...runtime,
        seed,
        limit,
        ...(signal ? { signal } : {}),
      }),
    );
  }

  async forYouTracks(
    pluginId: string,
    recentTracks: readonly PluginTrackReference[],
    likedTracks: readonly PluginTrackReference[],
    limit: number,
    signal?: AbortSignal,
  ): Promise<PluginRecommendationCandidate[]> {
    const definition = await this.requireEnabled(pluginId);
    const provider = definition.recommendationProvider;
    if (!provider?.forYou) {
      throw new PluginError(
        "This plugin does not provide For You recommendations.",
        "unsupported",
        400,
      );
    }
    const runtime = await this.runtimeConfiguration(definition);
    return normalizeCandidates(
      await provider.forYou({
        ...runtime,
        recentTracks,
        likedTracks,
        limit,
        ...(signal ? { signal } : {}),
      }),
    );
  }

  async generatePlaylist(
    pluginId: string,
    input: {
      name: string | null;
      prompt: string | null;
      seed: PluginTrackReference | null;
      recentTracks: readonly PluginTrackReference[];
      likedTracks: readonly PluginTrackReference[];
      limit: number;
    },
    signal?: AbortSignal,
  ): Promise<{ name: string | null; items: PluginRecommendationCandidate[] }> {
    const definition = await this.requireEnabled(pluginId);
    const generator = definition.playlistGenerator;
    if (!generator) {
      throw new PluginError(
        "This plugin does not generate playlists.",
        "unsupported",
        400,
      );
    }
    if (input.prompt && !generator.contribution.supportsPrompt) {
      throw new PluginError(
        "This playlist generator does not accept prompts.",
        "invalid_configuration",
      );
    }
    if (input.seed && !generator.contribution.supportsSeed) {
      throw new PluginError(
        "This playlist generator does not accept a seed track.",
        "invalid_configuration",
      );
    }
    const runtime = await this.runtimeConfiguration(definition);
    const generated = await generator.generate({
      ...runtime,
      ...input,
      ...(signal ? { signal } : {}),
    });
    return {
      name: generated.name?.trim().slice(0, 160) || null,
      items: normalizeCandidates(generated.items),
    };
  }

  sourceHandle(source: SourceRow): PluginSourceHandle {
    const configuration = configurationValue(source.configuration);
    const credentials = source.credentialCiphertext
      ? configurationValue(
          this.credentials.decrypt(source.credentialCiphertext, "source"),
        )
      : {};
    return {
      id: source.id,
      name: source.name,
      configuration,
      credentials,
    };
  }

  safeSourceConfiguration(
    source: SourceRow,
    definition: PluginDefinition,
  ): PluginSourceConfiguration {
    return safeConfiguration(
      definition.source?.contribution.configurationFields ?? [],
      configurationValue(source.configuration),
    );
  }

  definition(pluginId: string): PluginDefinition {
    const definition = this.definitions.get(pluginId);
    if (!definition) {
      throw new PluginError("Plugin not found.", "invalid_configuration", 404);
    }
    return definition;
  }

  async installedDefinitions(): Promise<PluginDefinition[]> {
    return [...this.definitions.values()].filter((definition) =>
      this.activePlugins.has(definition.manifest.id),
    );
  }

  private async requireEnabled(pluginId: string): Promise<PluginDefinition> {
    const definition = await this.requireInstalled(pluginId);
    if (!this.activePlugins.has(pluginId)) {
      throw new PluginError(
        "The plugin is disabled. Restart the server to apply plugin changes.",
        "plugin_disabled",
        409,
        message("api.message.pluginDisabled"),
      );
    }
    return definition;
  }

  private async runtimeConfiguration(definition: PluginDefinition): Promise<{
    configuration: PluginConfiguration;
    credentials: PluginConfiguration;
  }> {
    const row = await this.database.orm.PluginInstallation.firstOrThrow({
      pluginId: definition.manifest.id,
    });
    const configuration = configurationValue(row.configuration);
    const credentials = configurationValue(
      row.credentialCiphertext
        ? this.credentials.decrypt(row.credentialCiphertext, "plugin")
        : null,
    );
    const settings = settingsResponse(definition, row, this.credentials);
    if (!settings.configured) {
      throw new PluginError(
        "Configure this plugin before using it.",
        "not_configured",
        409,
      );
    }
    return { configuration, credentials };
  }

  private async removeUnusedCovers(
    candidateCoverIds: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(candidateCoverIds)];
    for (const coverId of unique) {
      const reference = await this.database.orm.Track.where({
        coverId,
      }).first();
      if (!reference) {
        await this.database.orm.TrackCover.where({ id: coverId }).delete();
      }
    }
  }

  private toResponse(
    definition: PluginDefinition,
    installation: PluginInstallation,
    row: PluginInstallationRow | null,
  ): PluginResponse {
    return {
      id: definition.manifest.id,
      name: definition.manifest.name,
      descriptionMessage: definition.manifest.descriptionMessage,
      version: installation.version,
      sdkVersion: definition.manifest.sdkVersion,
      capabilities: [...definition.manifest.capabilities],
      permissions: [...definition.manifest.permissions],
      contributions: contributionResponses(definition),
      installed: installation.installed,
      enabled: row?.enabled === 1,
      restartRequired:
        installation.installed &&
        (row?.enabled === 1) !== this.activePlugins.has(definition.manifest.id),
      installedAt: installation.installedAt?.toISOString() ?? null,
      installSource: installation.installSource,
      installSourceLocator: installation.installSourceLocator,
      icon: definition.manifest.icon,
      settings: settingsResponse(definition, row, this.credentials),
    };
  }
}
