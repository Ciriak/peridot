#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/05ef14e09055a1e89fe0d4263fdfa341825af094253dfc0fc2cb819591ad0427/contract';
import endContract from '../../snapshots/05ef14e09055a1e89fe0d4263fdfa341825af094253dfc0fc2cb819591ad0427/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5e5cd62452bcf2b23307a87be75af60e40feb17f74db5bb4e4093dc3a1a4219a/contract';
import startContract from '../../snapshots/5e5cd62452bcf2b23307a87be75af60e40feb17f74db5bb4e4093dc3a1a4219a/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  foreignKey,
  primaryKey,
  sql,
  unique,
} from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'PasswordResetToken',
        columns: [
          col('createdAt', 'TEXT', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'sqlite/datetime@1' },
          }),
          col('expiresAt', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/datetime@1' } }),
          col('id', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('tokenHash', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
          col('userId', 'TEXT', { notNull: true, codecRef: { codecId: 'sqlite/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['tokenHash']),
          foreignKey(['userId'], 'User', ['id'], { onDelete: 'cascade' }),
        ],
      }),
      this.createIndex({
        table: 'PasswordResetToken',
        index: 'PasswordResetToken_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        table: 'PasswordResetToken',
        index: 'PasswordResetToken_userId_idx_a489d58a',
        columns: ['userId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
