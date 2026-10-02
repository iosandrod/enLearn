import { Module } from '@nestjs/common';
import { PrintArtifactStorage } from './print-artifact.storage';
import { PrintJobRepository } from './print-job.repository';
import { PrintRenderPool } from './print-render.pool';
import { PrintService } from './print.service';

@Module({
  providers: [PrintService, PrintJobRepository, PrintRenderPool, PrintArtifactStorage],
  exports: [PrintService]
})
export class PrintModule {}
