#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b91674bc063489d8959b6f40b8130847a63d7b56156a8065b9c26bdc2ee14cde/contract';
import startContract from '../../snapshots/b91674bc063489d8959b6f40b8130847a63d7b56156a8065b9c26bdc2ee14cde/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/da8fb2c157d7640b9b437eacfd3e299c4cd7f77a8d09a6cff38de12e8e95c458/contract';
import endContract from '../../snapshots/da8fb2c157d7640b9b437eacfd3e299c4cd7f77a8d09a6cff38de12e8e95c458/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'PluginInstallation',
        column: {
          name: 'enabled',
          typeSql: 'INTEGER',
          default: { kind: 'literal', value: '1' },
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: false,
        },
      }),
      this.createIndex({
        table: 'PluginInstallation',
        index: 'PluginInstallation_installed_enabled_idx_506a1df3',
        columns: ['installed', 'enabled'],
      }),
      this.dropIndex({
        table: 'PluginInstallation',
        index: 'PluginInstallation_installed_idx_fe8abdbf',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
