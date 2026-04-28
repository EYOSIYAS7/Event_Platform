import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';

async function bootstrap() {
  // Create the app with body parser DISABLED globally
  // The proxy middleware needs the raw stream — if NestJS parses the body first,
  // the stream is consumed and the proxy forwards an empty body causing a 408
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Manually apply body parsing ONLY for non-proxied routes
  // i.e. everything except /v1/users/* which goes to the proxy
  app.use((req: any, res: any, next: any) => {
    if (req.path.startsWith('/v1/users')) {
      // Skip body parsing — let the proxy forward the raw stream
      return next();
    }
    // Apply body parsing for all other routes (health, future gateway-native routes)
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
