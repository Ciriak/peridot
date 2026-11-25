#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7fb2e91df85da52ca54ad7f6ff71621577a757d8b112f95a109d4653e0773135/contract';
import startContract from '../../snapshots/7fb2e91df85da52ca54ad7f6ff71621577a757d8b112f95a109d4653e0773135/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a9baeceeeaa3a1e81dd916241cc6e611b8ff32b7d2e2458752d7a463cd6c974a/contract';
import endContract from '../../snapshots/a9baeceeeaa3a1e81dd916241cc6e611b8ff32b7d2e2458752d7a463cd6c974a/contract.json' with { type: 'json' };
import { dataTransform, Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'DownloadClient',
        column: {
          name: 'destinationSourceId',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      dataTransform({
        id: 'data_migration.move-destination-source-to-download-client',
        label: 'Move indexer destinations to download clients',
        table: 'DownloadClient',
        description:
          'Copy each active indexer destination to its download client before removing the indexer column',
        run: () => `
          UPDATE "DownloadClient"
          SET "destinationSourceId" = (
            SELECT "ReleaseIndexer"."destinationSourceId"
            FROM "ReleaseIndexer"
            WHERE "ReleaseIndexer"."downloadClientId" = "DownloadClient"."id"
              AND "ReleaseIndexer"."removedAt" IS NULL
              AND "ReleaseIndexer"."destinationSourceId" IS NOT NULL
            ORDER BY
              "ReleaseIndexer"."position" ASC,
              "ReleaseIndexer"."createdAt" ASC,
              "ReleaseIndexer"."id" ASC
            LIMIT 1
          )
          WHERE "destinationSourceId" IS NULL
            AND EXISTS (
              SELECT 1
              FROM "ReleaseIndexer"
              WHERE "ReleaseIndexer"."downloadClientId" = "DownloadClient"."id"
                AND "ReleaseIndexer"."removedAt" IS NULL
                AND "ReleaseIndexer"."destinationSourceId" IS NOT NULL
            )
        `,
      }),
      this.dropColumn({ table: 'ReleaseIndexer', column: 'destinationSourceId' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
