#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4ec7a4c60e9a0744c3ae6737869dfeff69184c2a83bec1a720f953fb929efdc9/contract';
import endContract from '../../snapshots/4ec7a4c60e9a0744c3ae6737869dfeff69184c2a83bec1a720f953fb929efdc9/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9f5ee14e4700bf598fae82a09b95bdd2ffa210886f4455c39e759b72b08af600/contract';
import startContract from '../../snapshots/9f5ee14e4700bf598fae82a09b95bdd2ffa210886f4455c39e759b72b08af600/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'Task',
        column: {
          name: 'payload',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
