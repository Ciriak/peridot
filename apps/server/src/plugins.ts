import type {
  PluginContributionResponse,
  PluginListResponse,
  PluginResponse,
  PluginSourceOptionResponse,
} from "@peridot/contracts";
import {
  PluginError,
  type PluginDefinition,
  type PluginInstallation,
  type PluginSourceConfiguration,
  type PluginSourceHandle,
} from "@peridot/plugin-sdk";
import type { CatalogService } from "./catalog.js";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import type { SourceRow } from "./prisma/models.js";
import type { TaskService } from "./tasks.js";

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
        .slice(0, 64),
    );
  } catch {
    return {};
  }
}

function safeConfiguration(
  definition: PluginDefinition,
  configuration: PluginSourceConfiguration,
): PluginSourceConfiguration {
  const fields = definition.source?.contribution.configurationFields ?? [];
  const secretKeys = new Set(
    fields.filter((field) => field.secret).map((field) => field.key),
  );
  return Object.fromEntries(
    Object.entries(configuration).filter(([key]) => !secretKeys.has(key)),
  );
}

function contributionResponses(
  definition: PluginDefinition,
): PluginContributionResponse[] {
  return definition.contributions.map((contribution) =>
    contribution.kind === "source"
      ? {
          kind: "source",
          configurationFields: contribution.configurationFields.map(
            (field) => ({
              ...field,
            }),
          ),
          discovery: contribution.discovery
            ? { ...contribution.discovery }
            : null,
        }
      : { kind: contribution.kind },
  );
}

function installationRow(
  definition: PluginDefinition,
  row: {
    installed: number;
    installedAt: Date | null;
    installSource: string;
    installSourceLocator: string;
    version: string;
  } | null,
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

  constructor(
    private readonly database: Database,
    private readonly credentials: CredentialStore,
    definitions: readonly PluginDefinition[],
  ) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.manifest.id)) {
        throw new Error(`Duplicate plugin id: ${definition.manifest.id}`);
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
        installedAt: now,
        installSource: definition.manifest.installSource,
        installSourceLocator: definition.manifest.installSourceLocator,
        version: definition.manifest.version,
      });
    }
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
        return this.toResponse(definition, installation);
      }),
    };
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
    return this.toResponse(definition, installationRow(definition, row));
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
        installedAt: null,
      });
    });
    await this.removeUnusedCovers(
      tracks.flatMap((track) => (track.coverId ? [track.coverId] : [])),
    );
    await catalog.flushChanges();
    const row = await this.database.orm.PluginInstallation.firstOrThrow({
      pluginId,
    });
    return this.toResponse(definition, installationRow(definition, row));
  }

  async discoverSources(
    pluginId: string,
    configuration: PluginSourceConfiguration,
    signal?: AbortSignal,
  ): Promise<PluginSourceOptionResponse[]> {
    const definition = await this.requireInstalled(pluginId);
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
    const definition = await this.requireInstalled(pluginId);
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
    const definition = await this.requireInstalled(source.pluginId);
    return definition.source ?? null;
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
      definition,
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
    const rows = await this.database.orm.PluginInstallation.where({
      installed: 1,
    }).all();
    const installed = new Set(rows.map((row) => row.pluginId));
    return [...this.definitions.values()].filter((definition) =>
      installed.has(definition.manifest.id),
    );
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
      installedAt: installation.installedAt?.toISOString() ?? null,
      installSource: installation.installSource,
      installSourceLocator: installation.installSourceLocator,
      icon: definition.manifest.icon,
    };
  }
}
