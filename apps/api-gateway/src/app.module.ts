import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration';
import { GatewayClientsModule } from './clients/clients.module';
import { GatewayAuthGuard } from './guards/auth.guard';
import { RedisThrottlerStorage } from './throttler/redis-throttler.store';
import { HealthController } from './health/health.controller';
import { UsersProxyMiddleware } from './proxy/users.proxy.controller';
import { EventsProxyMiddleware } from './proxy/event.proxy.controller';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl')!,
            limit: config.get<number>('throttle.limit')!,
          },
        ],
        storage: new RedisThrottlerStorage(config),
      }),
      inject: [ConfigService],
    }),
    GatewayClientsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: GatewayAuthGuard },
    RedisThrottlerStorage,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(UsersProxyMiddleware)
      .forRoutes({ path: 'users/*path', method: RequestMethod.ALL });

    consumer
      .apply(EventsProxyMiddleware)
      .forRoutes({ path: 'events-service/*path', method: RequestMethod.ALL });
  }
}
