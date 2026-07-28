import { Module } from '@nestjs/common';
import { EntityDesignService } from './entity-design.service';

@Module({
  providers: [EntityDesignService],
  exports: [EntityDesignService]
})
export class EntityDesignModule {}
