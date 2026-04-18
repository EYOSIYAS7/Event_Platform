import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // HTTP server (health checks, Swagger)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('v1');

  // TCP Microservice transport (for inter-service sync calls)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: 4001,
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3001);
  console.log(`Users service running on port ${process.env.PORT ?? 3001}`);
}
bootstrap();
