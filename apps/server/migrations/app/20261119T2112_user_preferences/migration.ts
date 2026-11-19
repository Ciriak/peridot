#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/91a3040941397282f212b07fb898bfaf79a2b6a35ef99b50cb2c34caedd47971/contract';
import endContract from '../../snapshots/91a3040941397282f212b07fb898bfaf79a2b6a35ef99b50cb2c34caedd47971/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e21b21dd96034f070368e9232b262ad5ae208d084ef3f77ed93e3ef3673607f6/contract';
import startContract from '../../snapshots/e21b21dd96034f070368e9232b262ad5ae208d084ef3f77ed93e3ef3673607f6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'User',
        column: {
          name: 'likedTitlesOffline',
          typeSql: 'INTEGER',
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: true,
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
