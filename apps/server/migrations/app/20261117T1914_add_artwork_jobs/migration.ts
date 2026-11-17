#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4708250320cb1838b745eec80208e7ddea8325b16f784084116cbff5294d845e/contract';
import endContract from '../../snapshots/4708250320cb1838b745eec80208e7ddea8325b16f784084116cbff5294d845e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9b4234f0591e41176d20f5d34fd379b28d1d2b94ea0a96897b3f39d419b8af81/contract';
import startContract from '../../snapshots/9b4234f0591e41176d20f5d34fd379b28d1d2b94ea0a96897b3f39d419b8af81/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  foreignKey,
  lit,
  primaryKey,
  sql,
  unique,
} from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'ArtworkJob',
        columns: [
          col('attemptCount', 'INTEGER', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'sqlite/integer@1' },
          }),
          col('createdAt', 'TEXT', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'sqlite/datetime@1' },
          }),
          col('externalCoverItemId', 'TEXT', {
            notNull: true,
            codecRef: { codecId: 'sqlite/text@1' },
          }),
          col('externalCoverTag', 'TEXT', { codecRef: { codecId: 'sqlite/text@1' } }),
          col('id', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('lastAttemptAt', 'TEXT', { codecRef: { codecId: 'sqlite/datetime@1' } }),
          col('sourceId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('trackId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('updatedAt', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/datetime@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['trackId']),
          foreignKey(['trackId'], 'Track', ['id'], { onDelete: 'cascade' }),
          foreignKey(['sourceId'], 'Source', ['id'], { onDelete: 'cascade' }),
        ],
      }),
      this.addColumn({
        table: 'Track',
        column: {
          name: 'externalCoverKey',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      this.createIndex({
        table: 'ArtworkJob',
        index: 'ArtworkJob_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        table: 'ArtworkJob',
        index: 'ArtworkJob_sourceId_idx_d92a2571',
        columns: ['sourceId'],
      }),
      this.createIndex({
        table: 'ArtworkJob',
        index: 'artwork_source_cover_170ef716',
        columns: ['sourceId', 'externalCoverItemId', 'externalCoverTag'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
