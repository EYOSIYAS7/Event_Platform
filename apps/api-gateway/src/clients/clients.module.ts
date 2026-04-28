import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

// These injection tokens are what controllers use to inject the right client
export const USERS_SERVICE = 'USERS_SERVICE';
export const EVENTS_SERVICE = 'EVENTS_SERVICE';
export const BOOKINGS_SERVICE = 'BOOKINGS_SERVICE';
export const PAYMENTS_SERVICE = 'PAYMENTS_SERVICE';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: USERS_SERVICE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('services.users.host'),
            port: config.get('services.users.port'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: EVENTS_SERVICE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('services.events.host'),
            port: config.get('services.events.port'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: BOOKINGS_SERVICE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('services.bookings.host'),
            port: config.get('services.bookings.port'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: PAYMENTS_SERVICE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get('services.payments.host'),
            port: config.get('services.payments.port'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class GatewayClientsModule {}
