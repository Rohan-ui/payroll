import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { UsersController } from './users.controller';
import { CrmService } from './crm.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmController, UsersController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
