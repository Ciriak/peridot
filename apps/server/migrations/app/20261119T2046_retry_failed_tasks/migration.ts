#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3af44e392cfe091c4eb40494da1fc426edf497151a03039f9f1566b9cbbe1f72/contract';
import startContract from '../../snapshots/3af44e392cfe091c4eb40494da1fc426edf497151a03039f9f1566b9cbbe1f72/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8dc83638331d0248c225aa4c02d8fd63cf01fbd1c34c464d02566bdaf8e740c7/contract';
import endContract from '../../snapshots/8dc83638331d0248c225aa4c02d8fd63cf01fbd1c34c464d02566bdaf8e740c7/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'Task',
        column: {
          name: 'retryCount',
          typeSql: 'INTEGER',
          default: { kind: 'literal', value: '0' },
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: false,
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
