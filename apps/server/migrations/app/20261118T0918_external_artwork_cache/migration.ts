#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4708250320cb1838b745eec80208e7ddea8325b16f784084116cbff5294d845e/contract';
import startContract from '../../snapshots/4708250320cb1838b745eec80208e7ddea8325b16f784084116cbff5294d845e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fb6cc2e0b2e51eb223bd9403134ecbb7e3b9d82ee89302e8b41accf0b8e428e4/contract';
import endContract from '../../snapshots/fb6cc2e0b2e51eb223bd9403134ecbb7e3b9d82ee89302e8b41accf0b8e428e4/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  dataTransform,
} from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      dataTransform({
        id: 'data_migration.clear-track-artwork-references',
        label: 'Clear track artwork references',
        table: 'Track',
        description:
          'Artwork is regenerated into the external WebP cache by the next scan',
        run: () => `UPDATE "Track" SET "coverId" = NULL`,
      }),
      dataTransform({
        id: 'data_migration.clear-catalog-track-artwork-references',
        label: 'Clear projected track artwork references',
        table: 'CatalogTrack',
        description:
          'Remove stale external artwork identifiers from catalog projections',
        run: () => `UPDATE "CatalogTrack" SET "coverId" = NULL`,
      }),
      dataTransform({
        id: 'data_migration.clear-catalog-album-artwork-references',
        label: 'Clear album artwork references',
        table: 'CatalogAlbum',
        description:
          'Remove stale external artwork identifiers from album projections',
        run: () =>
          `UPDATE "CatalogAlbum" SET "coverId" = NULL, "coverTrackId" = NULL`,
      }),
      dataTransform({
        id: 'data_migration.clear-artist-artwork-references',
        label: 'Clear artist portrait references',
        table: 'ArtistMetadata',
        description:
          'Artist portraits are fetched and normalized again by metadata enrichment',
        run: () =>
          `UPDATE "ArtistMetadata" SET "imageId" = NULL, "imageProviderId" = NULL, "imageProviderKind" = NULL, "imageProviderName" = NULL, "imageExternalArtistId" = NULL, "imageSourceUrl" = NULL, "attemptedSignature" = NULL`,
      }),
      dataTransform({
        id: 'data_migration.delete-embedded-track-artwork',
        label: 'Delete embedded track artwork',
        table: 'TrackCover',
        description: 'Remove artwork BLOBs before dropping their storage column',
        run: () => `DELETE FROM "TrackCover"`,
      }),
      dataTransform({
        id: 'data_migration.delete-embedded-artist-artwork',
        label: 'Delete embedded artist artwork',
        table: 'ArtistImage',
        description:
          'Remove portrait BLOBs before dropping their storage column',
        run: () => `DELETE FROM "ArtistImage"`,
      }),
      this.dropColumn({ table: 'ArtistImage', column: 'data' }),
      this.dropColumn({ table: 'ArtistImage', column: 'mimeType' }),
      this.dropColumn({ table: 'TrackCover', column: 'data' }),
      this.dropColumn({ table: 'TrackCover', column: 'mimeType' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
