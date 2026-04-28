export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6380',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6380', 10),
  },
  services: {
    users: {
      host: process.env.USERS_SERVICE_HOST ?? 'localhost',
      port: 4001,
      httpPort: 3001,
    },
    events: {
      host: process.env.EVENTS_SERVICE_HOST ?? 'localhost',
      port: 4002,
      httpPort: 3002,
    },
    bookings: {
      host: process.env.BOOKINGS_SERVICE_HOST ?? 'localhost',
      port: 4003,
      httpPort: 3003,
    },
    payments: {
      host: process.env.PAYMENTS_SERVICE_HOST ?? 'localhost',
      port: 4004,
      httpPort: 3004,
    },
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10), // 1 minute window
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10), // 100 req / window
  },
});
