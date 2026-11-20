#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/65d6faa975e23cbe3e3d0ee7d450f3142a29da04ab07ba161a51590a87d3234d/contract';
import endContract from '../../snapshots/65d6faa975e23cbe3e3d0ee7d450f3142a29da04ab07ba161a51590a87d3234d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/91a3040941397282f212b07fb898bfaf79a2b6a35ef99b50cb2c34caedd47971/contract';
import startContract from '../../snapshots/91a3040941397282f212b07fb898bfaf79a2b6a35ef99b50cb2c34caedd47971/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [this.dropTable({ table: 'QueueItem' }), this.dropTable({ table: 'QueueState' })];
  }
}

MigrationCLI.run(import.meta.url, M);
