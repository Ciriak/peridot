#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b91674bc063489d8959b6f40b8130847a63d7b56156a8065b9c26bdc2ee14cde/contract';
import endContract from '../../snapshots/b91674bc063489d8959b6f40b8130847a63d7b56156a8065b9c26bdc2ee14cde/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/da6afdb4d7c8cafd144930cbcb8fc7105bbec726d2b453025fbb96ff59c784b2/contract';
import startContract from '../../snapshots/da6afdb4d7c8cafd144930cbcb8fc7105bbec726d2b453025fbb96ff59c784b2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'PluginInstallation',
        column: {
          name: 'configuration',
          typeSql: 'TEXT',
          default: { kind: 'literal', value: '{}' },
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: false,
        },
      }),
      this.addColumn({
        table: 'PluginInstallation',
        column: {
          name: 'credentialCiphertext',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
