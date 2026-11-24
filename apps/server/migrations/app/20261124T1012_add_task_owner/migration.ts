#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/62852c84f360700fb54d673a54a0791178d3f524fd14d42249cc7465c6681bd9/contract';
import startContract from '../../snapshots/62852c84f360700fb54d673a54a0791178d3f524fd14d42249cc7465c6681bd9/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9f5ee14e4700bf598fae82a09b95bdd2ffa210886f4455c39e759b72b08af600/contract';
import endContract from '../../snapshots/9f5ee14e4700bf598fae82a09b95bdd2ffa210886f4455c39e759b72b08af600/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.recreateTable({
        tableName: 'Task',
        contractTable: {
          columns: [
            {
              name: 'completedAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/datetime@1' },
              nullable: true,
            },
            {
              name: 'createdAt',
              typeSql: 'TEXT',
              default: { kind: 'function', expression: sql`now()` },
              codecRef: { codecId: 'sqlite/datetime@1' },
              nullable: false,
            },
            {
              name: 'details',
              typeSql: 'TEXT',
              default: { kind: 'literal', value: '[]' },
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'failureMessage',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'failureSummary',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'forceRefresh',
              typeSql: 'INTEGER',
              default: { kind: 'literal', value: '0' },
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
              name: 'kind',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'ownerUserId',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'parentTaskId',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'progressCompleted',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: true,
            },
            {
              name: 'progressTotal',
              typeSql: 'INTEGER',
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: true,
            },
            {
              name: 'retryCount',
              typeSql: 'INTEGER',
              default: { kind: 'literal', value: '0' },
              codecRef: { codecId: 'sqlite/integer@1' },
              nullable: false,
            },
            {
              name: 'sourceId',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'sourceName',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
            },
            {
              name: 'startedAt',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/datetime@1' },
              nullable: true,
            },
            {
              name: 'status',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'title',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: false,
            },
            {
              name: 'titleMessage',
              typeSql: 'TEXT',
              codecRef: { codecId: 'sqlite/text@1' },
              nullable: true,
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
          foreignKeys: [
            {
              columns: ['ownerUserId'],
              references: { table: 'User', columns: ['id'] },
              onDelete: 'setNull',
            },
          ],
        },
        schemaColumnNames: [
          'completedAt',
          'createdAt',
          'details',
          'failureMessage',
          'failureSummary',
          'forceRefresh',
          'id',
          'kind',
          'parentTaskId',
          'progressCompleted',
          'progressTotal',
          'retryCount',
          'sourceId',
          'sourceName',
          'startedAt',
          'status',
          'title',
          'titleMessage',
          'updatedAt',
        ],
        indexes: [
          { name: 'Task_kind_status_idx_8034fcaa', columns: ['kind', 'status'] },
          { name: 'Task_ownerUserId_idx_f93ae154', columns: ['ownerUserId'] },
          { name: 'Task_parentTaskId_idx_fb3d4259', columns: ['parentTaskId'] },
          { name: 'Task_status_createdAt_idx_58610442', columns: ['status', 'createdAt'] },
        ],
        summary:
          'Recreates table Task to apply schema changes: database/Task/foreign-key:ownerUserId->.User(id); database/Task/column:ownerUserId',
        postchecks: [
          {
            description: 'verify "ownerUserId" nullability on "Task"',
            sql: `SELECT COUNT(*) > 0 FROM pragma_table_info('Task') WHERE name = 'ownerUserId' AND "notnull" = 0`,
          },
          {
            description: 'verify foreign key (ownerUserId) → User(id) on "Task"',
            sql: `SELECT EXISTS (SELECT 1 FROM pragma_foreign_key_list('Task') f WHERE f."table" = 'User' AND f.on_delete = 'SET NULL' AND f.on_update = 'NO ACTION' GROUP BY f.id HAVING COUNT(*) = 1 AND SUM(CASE WHEN (f."from", f."to") IN (('ownerUserId', 'id')) THEN 1 ELSE 0 END) = 1)`,
          },
          {
            description: 'verify "Task" has exactly 1 foreign keys',
            sql: "SELECT (SELECT COUNT(DISTINCT id) FROM pragma_foreign_key_list('Task')) = 1",
          },
        ],
        operationClass: 'widening',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
