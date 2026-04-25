import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  async check() {
    // Ping DB with a lightweight query
    await this.prisma.$queryRaw`SELECT 1`;

    // Ping Redis
    await this.redis.set('health:ping', 'pong', 5);

    return {
      status: 'ok',
      service: 'users-service',
      timestamp: new Date().toISOString(),
    };
  }
}
