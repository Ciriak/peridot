#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8466b5a38d1fae0b36b2c3f0e74773a784afb6f6418df750f9e4c16c11e92bdc/contract';
import startContract from '../../snapshots/8466b5a38d1fae0b36b2c3f0e74773a784afb6f6418df750f9e4c16c11e92bdc/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b7404da89f184c311c251f7ebbaa77db518dfc1bcd75c2392dd6a3d3bf3b84a0/contract';
import endContract from '../../snapshots/b7404da89f184c311c251f7ebbaa77db518dfc1bcd75c2392dd6a3d3bf3b84a0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.recreateTable({
        tableName: 'Source',
        contractTable: {
          columns: [
            {
              name: 'configuration',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'createdAt',
              typeSql: 'TEXT',
              default: { kind: 'function', expression: sql`now()` },
              codecRef: { codecId: 'sqlite/datetime@1' },
              nullable: false,
            },
            {
              name: 'credentialCiphertext',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'id',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'kind',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'lastSyncedAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/datetime@1' },
              nullable: true,
            },
            {
              name: 'name',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'path',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'position',
              typeSql: 'INTEGER',
              default: { kind: 'literal', value: '0' },
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'sourceIdentity',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'updatedAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/datetime@1' },
              nullable: false,
            },
            {
              name: 'url',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
          ],
          primaryKey: { columns: ['id'] },
          uniques: [{ columns: ['kind', 'sourceIdentity'] }],
          foreignKeys: [],
        },
        schemaColumnNames: [
          'configuration',
          'createdAt',
          'credentialCiphertext',
          'id',
          'kind',
          'lastSyncedAt',
          'name',
          'path',
          'pluginId',
          'pluginSourceIdentity',
          'position',
          'updatedAt',
          'url',
        ],
        indexes: [
          { name: 'Source_kind_idx_c9ca668f', columns: ['kind'] },
          { name: 'Source_position_idx_82a01784', columns: ['position'] },
        ],
        summary:
          'Recreates table Source to apply schema changes: database/Source/unique:kind,sourceIdentity; database/Source/column:sourceIdentity',
        postchecks: [
          {
            description: 'verify "sourceIdentity" nullability on "Source"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Source') WHERE name = 'sourceIdentity' AND "notnull" = 0`,
          },
          {
            description: 'verify unique constraint (kind, sourceIdentity) on "Source"',
            sql: `SELECT EXISTS (SELECT 1 FROM pragma_index_list('Source') l WHERE l."unique" = 1 AND (SELECT COUNT(*) FROM pragma_index_info(l.name)) = 2 AND (SELECT COUNT(*) FROM pragma_index_info(l.name) WHERE name IN ('kind', 'sourceIdentity')) = 2)`,
          },
          {
            description: 'verify "Source" has no unique constraint besides the expected ones',
            sql: "SELECT NOT EXISTS (SELECT 1 FROM pragma_index_list('Source') l WHERE l.origin = 'u' AND NOT (((SELECT COUNT(*) FROM pragma_index_info(l.name)) = 2 AND (SELECT COUNT(*) FROM pragma_index_info(l.name) WHERE name IN ('kind', 'sourceIdentity')) = 2)))",
          },
        ],
        operationClass: 'destructive',
      }),
      this.dropColumn({ table: 'Source', column: 'pluginSourceIdentity' }),
      this.dropColumn({ table: 'Source', column: 'pluginId' }),
      this.dropIndex({ table: 'Source', index: 'Source_pluginId_idx_32c3e11d' }),
      this.dropTable({ table: 'PluginInstallation' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
