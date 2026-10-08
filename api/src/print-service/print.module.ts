import { Module } from '@nestjs/common';
import { PrintArtifactStorage } from './print-artifact.storage';
import { PrintJobRepository } from './print-job.repository';
import { PrintRenderPool } from './print-render.pool';
import { PrintService } from './print.service';
import { PrintDataSourceRuntime } from './print-data-source.runtime';

@Module({
  providers: [PrintService, PrintJobRepository, PrintRenderPool, PrintArtifactStorage, PrintDataSourceRuntime],
  exports: [PrintService]
})
export class PrintModule {}
