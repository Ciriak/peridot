#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/05ef14e09055a1e89fe0d4263fdfa341825af094253dfc0fc2cb819591ad0427/contract';
import startContract from '../../snapshots/05ef14e09055a1e89fe0d4263fdfa341825af094253dfc0fc2cb819591ad0427/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ba133506171d37b8a85af222553e3399c488fa1856749d814284ab46a4e99533/contract';
import endContract from '../../snapshots/ba133506171d37b8a85af222553e3399c488fa1856749d814284ab46a4e99533/contract.json' with { type: 'json' };
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
              default: { kind: 'literal', value: '3' },
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
          'Recreates table ServerSetting to apply schema changes: database/ServerSetting/column:fileLoggingEnabled/default; database/ServerSetting/column:fileLogRetentionDays',
        postchecks: [
          {
            description: 'verify "fileLoggingEnabled" default on "ServerSetting"',
            columnDefault: 'fileLoggingEnabled',
          },
          {
            description: 'verify "fileLogRetentionDays" nullability on "ServerSetting"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('ServerSetting') WHERE name = 'fileLogRetentionDays' AND "notnull" = 1`,
          },
        ],
        operationClass: 'widening',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
