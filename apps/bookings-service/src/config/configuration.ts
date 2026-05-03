export default () => ({
  port: parseInt(process.env.PORT ?? '3003', 10),
  tcpPort: parseInt(process.env.TCP_PORT ?? '4003', 10),
  database: { url: process.env.DATABASE_URL },
  redis: { url: process.env.REDIS_URL ?? 'redis://localhost:6380' },
  booking: {
    expiryMinutes: parseInt(process.env.BOOKING_EXPIRY_MINUTES ?? '15', 10),
  },
  services: {
    events: {
      host: process.env.EVENTS_SERVICE_HOST ?? 'localhost',
      port: 4002,
    },
  },
});
