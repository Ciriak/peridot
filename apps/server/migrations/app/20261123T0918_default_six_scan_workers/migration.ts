#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/047c2baee1f440ee5bc68058a2a1b6bdc93c730013bfa5568760f935e06794b0/contract';
import endContract from '../../snapshots/047c2baee1f440ee5bc68058a2a1b6bdc93c730013bfa5568760f935e06794b0/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/65d6faa975e23cbe3e3d0ee7d450f3142a29da04ab07ba161a51590a87d3234d/contract';
import startContract from '../../snapshots/65d6faa975e23cbe3e3d0ee7d450f3142a29da04ab07ba161a51590a87d3234d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.recreateTable({
        tableName: 'ServerSetting',
        contractTable: {
          columns: [
            {
              name: 'fileLogRetentionDays',
              typeSql: 'INTEGER',
              default: { kind: 'literal', value: '5' },
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'fileLoggingEnabled',
              typeSql: 'INTEGER',
              default: { kind: 'literal', value: '1' },
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'id',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'libraryRoot',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'scanWorkerCount',
              typeSql: 'INTEGER',
              default: { kind: 'literal', value: '6' },
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'sourceRefreshCron',
              typeSql: 'TEXT',
              default: { kind: 'literal', value: '0 3 * * *' },
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'sourceRefreshEnabled',
              typeSql: 'INTEGER',
              default: { kind: 'literal', value: '1' },
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'updatedAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/datetime@1' },
              nullable: false,
            },
          ],
          primaryKey: { columns: ['id'] },
          uniques: [],
          foreignKeys: [],
        },
        schemaColumnNames: [
          'fileLogRetentionDays',
          'fileLoggingEnabled',
          'id',
          'libraryRoot',
          'scanWorkerCount',
          'sourceRefreshCron',
          'sourceRefreshEnabled',
          'updatedAt',
        ],
        indexes: [],
        summary:
          'Recreates table ServerSetting to apply schema changes: database/ServerSetting/column:scanWorkerCount/default',
        postchecks: [
          {
            description: 'verify "scanWorkerCount" default on "ServerSetting"',
            columnDefault: 'scanWorkerCount',
          },
        ],
        operationClass: 'widening',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
