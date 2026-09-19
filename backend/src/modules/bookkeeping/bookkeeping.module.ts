import { Module } from '@nestjs/common';
import { BookkeepingService } from './bookkeeping.service';
import { FinancialYearsService } from './financial-years.service';
import { BookkeepingController } from './bookkeeping.controller';

@Module({
  controllers: [BookkeepingController],
  providers: [BookkeepingService, FinancialYearsService],
  exports: [BookkeepingService, FinancialYearsService],
})
export class BookkeepingModule {}
