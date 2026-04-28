import { Controller, Get } from '@nestjs/common';
import { Public } from '../guards/auth.guard';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
    };
  }
}
