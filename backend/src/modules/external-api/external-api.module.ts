import { Module } from '@nestjs/common';
import { ExternalApiService } from './external-api.service';
import { ExternalApiController } from './external-api.controller';

@Module({
  controllers: [ExternalApiController],
  providers: [ExternalApiService],
  exports: [ExternalApiService],
})
export class ExternalApiModule {}
