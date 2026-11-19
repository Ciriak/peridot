#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8dc83638331d0248c225aa4c02d8fd63cf01fbd1c34c464d02566bdaf8e740c7/contract';
import startContract from '../../snapshots/8dc83638331d0248c225aa4c02d8fd63cf01fbd1c34c464d02566bdaf8e740c7/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e21b21dd96034f070368e9232b262ad5ae208d084ef3f77ed93e3ef3673607f6/contract';
import endContract from '../../snapshots/e21b21dd96034f070368e9232b262ad5ae208d084ef3f77ed93e3ef3673607f6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, dataTransform } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'CatalogAlbum',
        column: {
          name: 'availableTrackCount',
          typeSql: 'INTEGER',
          default: { kind: 'literal', value: '0' },
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: false,
        },
      }),
      this.addColumn({
        table: 'CatalogArtist',
        column: {
          name: 'availableTrackCount',
          typeSql: 'INTEGER',
          default: { kind: 'literal', value: '0' },
          codecRef: { codecId: 'sqlite/integer@1' },
          nullable: false,
        },
      }),
      this.addColumn({
        table: 'CatalogTrack',
        column: {
          name: 'sourceId',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/text@1' },
          nullable: true,
        },
      }),
      this.addColumn({
        table: 'Source',
        column: {
          name: 'removedAt',
          typeSql: 'TEXT',
          codecRef: { codecId: 'sqlite/datetime@1' },
          nullable: true,
        },
      }),
      dataTransform({
        id: 'data_migration.backfill-catalog-track-source',
        label: 'Backfill catalog track source IDs',
        table: 'CatalogTrack',
        description:
          'Copy source ownership from durable tracks into catalog projections',
        run: () =>
          `UPDATE "CatalogTrack"
             SET "sourceId" = (
               SELECT "Track"."sourceId"
               FROM "Track"
               WHERE "Track"."id" = "CatalogTrack"."id"
             )
             WHERE EXISTS (
               SELECT 1
               FROM "Track"
               WHERE "Track"."id" = "CatalogTrack"."id"
                 AND "Track"."sourceId" IS NOT NULL
             )`,
      }),
      dataTransform({
        id: 'data_migration.backfill-album-available-counts',
        label: 'Backfill available album track counts',
        table: 'CatalogAlbum',
        description:
          'Initialize available counts from the current catalog projections',
        run: () =>
          `UPDATE "CatalogAlbum"
             SET "availableTrackCount" = (
               SELECT COUNT(*)
               FROM "CatalogTrack"
               WHERE "CatalogTrack"."albumId" = "CatalogAlbum"."id"
                 AND "CatalogTrack"."available" = 1
             )`,
      }),
      dataTransform({
        id: 'data_migration.backfill-artist-available-counts',
        label: 'Backfill available artist track counts',
        table: 'CatalogArtist',
        description:
          'Initialize available counts from current catalog artist links',
        run: () =>
          `UPDATE "CatalogArtist"
             SET "availableTrackCount" = (
               SELECT COUNT(*)
               FROM "CatalogTrackArtist"
               INNER JOIN "CatalogTrack"
                 ON "CatalogTrack"."id" = "CatalogTrackArtist"."trackId"
               WHERE "CatalogTrackArtist"."artistId" = "CatalogArtist"."id"
                 AND "CatalogTrack"."available" = 1
             )`,
      }),
      this.createIndex({
        table: 'CatalogTrack',
        index: 'CatalogTrack_sourceId_idx_d92a2571',
        columns: ['sourceId'],
      }),
      this.createIndex({
        table: 'Source',
        index: 'Source_removedAt_idx_fef869bb',
        columns: ['removedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
