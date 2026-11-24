#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/30048626d798e2591129760b3069b6cd26b378a1dadc6fc43e8e2de7f8491711/contract';
import startContract from '../../snapshots/30048626d798e2591129760b3069b6cd26b378a1dadc6fc43e8e2de7f8491711/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7fb2e91df85da52ca54ad7f6ff71621577a757d8b112f95a109d4653e0773135/contract';
import endContract from '../../snapshots/7fb2e91df85da52ca54ad7f6ff71621577a757d8b112f95a109d4653e0773135/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'Media',
        column: {
          name: 'manualOverrides',
          typeSql: 'TEXT',
          default: { kind: 'literal', value: '{}' },
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: false,
        },
      }),
      this.addColumn({
        table: 'MediaCopy',
        column: {
          name: 'manualOverrides',
          typeSql: 'TEXT',
          default: { kind: 'literal', value: '{}' },
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: false,
        },
      }),
      this.createIndex({
        table: 'Media',
        index: 'Media_updatedAt_id_idx_88868a1d',
        columns: ['updatedAt', 'id'],
      }),
      this.createIndex({
        table: 'MediaCopy',
        index: 'MediaCopy_audioLossless_audioBitrate_idx_c82c122e',
        columns: ['audioLossless', 'audioBitrate'],
      }),
      this.createIndex({
        table: 'MediaCopy',
        index: 'MediaCopy_fileSizeBytes_idx_2e2c7971',
        columns: ['fileSizeBytes'],
      }),
      this.createIndex({
        table: 'MediaCopy',
        index: 'MediaCopy_mimeType_idx_064291e0',
        columns: ['mimeType'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
