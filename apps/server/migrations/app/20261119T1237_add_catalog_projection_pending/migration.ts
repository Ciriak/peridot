#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8466b5a38d1fae0b36b2c3f0e74773a784afb6f6418df750f9e4c16c11e92bdc/contract';
import endContract from '../../snapshots/8466b5a38d1fae0b36b2c3f0e74773a784afb6f6418df750f9e4c16c11e92bdc/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/da8fb2c157d7640b9b437eacfd3e299c4cd7f77a8d09a6cff38de12e8e95c458/contract';
import startContract from '../../snapshots/da8fb2c157d7640b9b437eacfd3e299c4cd7f77a8d09a6cff38de12e8e95c458/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'Track',
        column: {
          name: 'catalogProjectionPending',
          typeSql: 'INTEGER',
          default: { kind: 'literal', value: '0' },
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: false,
        },
      }),
      this.createIndex({
        table: 'Track',
        index: 'Track_catalogProjectionPending_idx_95e4c1ad',
        columns: ['catalogProjectionPending'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
