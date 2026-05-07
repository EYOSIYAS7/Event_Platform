import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Skip body parsing for any route that gets proxied
  // Add new service prefixes here as we build them
  const proxiedRoutes = [
    '/v1/users',
    '/v1/events-service',
    '/v1/bookings-service',
  ];

  app.use((req: any, res: any, next: any) => {
    const isProxied = proxiedRoutes.some((route) => req.path.startsWith(route));
    if (isProxied) {
      return next();
    }
    express.json()(req, res, () => {
      express.urlencoded({ extended: true })(req, res, next);
    });
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('v1');

  const port = config.get<number>('port')!;
  await app.listen(port);
  logger.log(`API Gateway running on port ${port}`);
}
bootstrap();
