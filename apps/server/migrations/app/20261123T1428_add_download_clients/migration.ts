#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/047c2baee1f440ee5bc68058a2a1b6bdc93c730013bfa5568760f935e06794b0/contract';
import startContract from '../../snapshots/047c2baee1f440ee5bc68058a2a1b6bdc93c730013bfa5568760f935e06794b0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/62852c84f360700fb54d673a54a0791178d3f524fd14d42249cc7465c6681bd9/contract';
import endContract from '../../snapshots/62852c84f360700fb54d673a54a0791178d3f524fd14d42249cc7465c6681bd9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'DownloadClient',
        columns: [
          col('credentialCiphertext', 'TEXT', {
            notNull: true,
            codecRef: { codecId: 'sqlite/text@1' },
          }),
          col('id', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('kind', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('name', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('url', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('username', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
