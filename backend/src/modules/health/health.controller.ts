import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res() res: Response): Promise<Response> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return res.status(HttpStatus.OK).json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      });
    }
  }
}
