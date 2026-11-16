#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4e95e705bb64da3502c63812c1276da93b77815295ef507f0ffabcf2225fc0a1/contract';
import startContract from '../../snapshots/4e95e705bb64da3502c63812c1276da93b77815295ef507f0ffabcf2225fc0a1/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5e5cd62452bcf2b23307a87be75af60e40feb17f74db5bb4e4093dc3a1a4219a/contract';
import endContract from '../../snapshots/5e5cd62452bcf2b23307a87be75af60e40feb17f74db5bb4e4093dc3a1a4219a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'ServerSetting',
        column: {
          name: 'scanWorkerCount',
          typeSql: 'INTEGER',
          default: { kind: 'literal', value: '3' },
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: false,
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
