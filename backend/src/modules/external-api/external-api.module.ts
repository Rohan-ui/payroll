import { Module } from '@nestjs/common';
import { ExternalApiService } from './external-api.service';
import { ExternalApiController } from './external-api.controller';
import { CosecSyncService } from './cosec-sync.service';

@Module({
  controllers: [ExternalApiController],
  providers: [ExternalApiService, CosecSyncService],
  exports: [ExternalApiService, CosecSyncService],
})
export class ExternalApiModule {}
