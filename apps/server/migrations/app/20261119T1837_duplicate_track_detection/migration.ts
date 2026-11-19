#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3af44e392cfe091c4eb40494da1fc426edf497151a03039f9f1566b9cbbe1f72/contract';
import endContract from '../../snapshots/3af44e392cfe091c4eb40494da1fc426edf497151a03039f9f1566b9cbbe1f72/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b7404da89f184c311c251f7ebbaa77db518dfc1bcd75c2392dd6a3d3bf3b84a0/contract';
import startContract from '../../snapshots/b7404da89f184c311c251f7ebbaa77db518dfc1bcd75c2392dd6a3d3bf3b84a0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'DuplicateDetectionState',
        columns: [
          col('algorithmVersion', 'INTEGER', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'sqlite/integer@1' },
          }),
          col('groupCount', 'INTEGER', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'sqlite/integer@1' },
          }),
          col('hiddenCount', 'INTEGER', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'sqlite/integer@1' },
          }),
          col('id', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('lastCompletedAt', 'TEXT', { codecRef: { codecId: 'sqlite/datetime@1' } }),
          col('updatedAt', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/datetime@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        table: 'CatalogTrack',
        column: {
          name: 'duplicateOfId',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      this.addColumn({
        table: 'Track',
        column: {
          name: 'audioBitrate',
          typeSql: 'INTEGER',
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: true,
        },
      }),
      this.addColumn({
        table: 'Track',
        column: {
          name: 'audioLossless',
          typeSql: 'INTEGER',
          default: { kind: 'literal', value: '0' },
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: false,
        },
      }),
      this.addColumn({
        table: 'Track',
        column: {
          name: 'duplicateOfId',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      this.addColumn({
        table: 'Track',
        column: {
          name: 'recordingIdentityKeys',
          typeSql: 'TEXT',
          default: { kind: 'literal', value: '[]' },
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: false,
        },
      }),
      this.createIndex({
        table: 'CatalogTrack',
        index: 'CatalogTrack_duplicateOfId_idx_28ac86a0',
        columns: ['duplicateOfId'],
      }),
      this.createIndex({
        table: 'Track',
        index: 'Track_duplicateOfId_idx_28ac86a0',
        columns: ['duplicateOfId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
