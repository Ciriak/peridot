#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/9b4234f0591e41176d20f5d34fd379b28d1d2b94ea0a96897b3f39d419b8af81/contract';
import endContract from '../../snapshots/9b4234f0591e41176d20f5d34fd379b28d1d2b94ea0a96897b3f39d419b8af81/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ba133506171d37b8a85af222553e3399c488fa1856749d814284ab46a4e99533/contract';
import startContract from '../../snapshots/ba133506171d37b8a85af222553e3399c488fa1856749d814284ab46a4e99533/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, dataTransform } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      dataTransform({
        id: 'data_migration.reset-media-type-to-detected',
        label: 'Reset track media types to their detected values',
        table: 'Track',
        description:
          'Discard source and manual overrides before removing classification fields',
        run: () =>
          `UPDATE "Track" SET "mediaType" = "detectedMediaType", "mediaTypeOrigin" = "detectedMediaTypeOrigin"`,
      }),
      this.dropIndex({ table: 'Source', index: 'Source_classificationMode_idx_d9eab081' }),
      this.dropColumn({ table: 'Source', column: 'fixedMediaType' }),
      this.dropColumn({ table: 'Source', column: 'classificationMode' }),
      this.dropColumn({ table: 'Track', column: 'detectedMediaType' }),
      this.dropColumn({ table: 'Track', column: 'detectedMediaTypeOrigin' }),
      this.dropColumn({ table: 'Track', column: 'mediaTypeOverride' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
