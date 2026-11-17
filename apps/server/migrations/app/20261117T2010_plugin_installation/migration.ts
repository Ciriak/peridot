#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4708250320cb1838b745eec80208e7ddea8325b16f784084116cbff5294d845e/contract';
import startContract from '../../snapshots/4708250320cb1838b745eec80208e7ddea8325b16f784084116cbff5294d845e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ec4439f027192084c2f935618851071404049cbdad3a702b90e0a6f14ae7966e/contract';
import endContract from '../../snapshots/ec4439f027192084c2f935618851071404049cbdad3a702b90e0a6f14ae7966e/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  dataTransform,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'PluginInstallation',
        columns: [
          col('createdAt', 'TEXT', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'sqlite/datetime@1' },
          }),
          col('installSource', 'TEXT', {
            notNull: true,
            default: lit('bundled'),
            codecRef: { codecId: 'sqlite/text@1' },
          }),
          col('installSourceLocator', 'TEXT', {
            notNull: true,
            codecRef: { codecId: 'sqlite/text@1' },
          }),
          col('installed', 'INTEGER', {
            notNull: true,
            default: lit('1'),
            codecRef: { codecId: 'sqlite/integer@1' },
          }),
          col('installedAt', 'TEXT', { codecRef: { codecId: 'sqlite/datetime@1' } }),
          col('pluginId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('updatedAt', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/datetime@1' } }),
          col('version', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
        ],
        constraints: [primaryKey(['pluginId'])],
      }),
      this.addColumn({
        table: 'Source',
        column: {
          name: 'configuration',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      this.addColumn({
        table: 'Source',
        column: {
          name: 'pluginId',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      this.addColumn({
        table: 'Source',
        column: {
          name: 'pluginSourceIdentity',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      this.createIndex({
        table: 'PluginInstallation',
        index: 'PluginInstallation_installed_idx_fe8abdbf',
        columns: ['installed'],
      }),
      this.createIndex({
        table: 'Source',
        index: 'Source_pluginId_idx_32c3e11d',
        columns: ['pluginId'],
      }),
      dataTransform({
        id: 'data_migration.install-jellyfin-plugin',
        label: 'Install the bundled Jellyfin plugin',
        table: 'PluginInstallation',
        description: 'Marks Jellyfin installed so existing sources remain active.',
        run: () =>
          `INSERT OR IGNORE INTO "PluginInstallation" ("pluginId", "installed", "installedAt", "installSource", "installSourceLocator", "version", "updatedAt") VALUES ('jellyfin', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'bundled', '@peridot/plugin-jellyfin', '0.0.7', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      }),
      dataTransform({
        id: 'data_migration.genericize-jellyfin-sources',
        label: 'Move Jellyfin source configuration into plugin fields',
        table: 'Source',
        description: 'Preserves configured Jellyfin sources while removing protocol-specific columns.',
        run: () =>
          `UPDATE "Source" SET "kind" = 'plugin', "pluginId" = "integration", "pluginSourceIdentity" = json_array("url", "externalLibraryId"), "configuration" = json_object('url', "url", 'libraryId', "externalLibraryId", 'libraryCollectionType', COALESCE("externalLibraryCollectionType", '')) WHERE "kind" = 'integration' AND "integration" = 'jellyfin'`,
      }),
      dataTransform({
        id: 'data_migration.generic-source-media-origin',
        label: 'Genericize source media provenance',
        table: 'Track',
        description: 'Maps the former Jellyfin provenance value to the generic source value.',
        run: () =>
          `UPDATE "Track" SET "mediaTypeOrigin" = 'source' WHERE "mediaTypeOrigin" = 'jellyfin'`,
      }),
      this.dropColumn({ table: 'Source', column: 'externalLibraryCollectionType' }),
      this.dropColumn({ table: 'Source', column: 'externalLibraryId' }),
      this.dropColumn({ table: 'Source', column: 'integration' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
