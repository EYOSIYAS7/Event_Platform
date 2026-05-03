export default () => ({
  port: parseInt(process.env.PORT ?? '3002', 10),
  tcpPort: parseInt(process.env.TCP_PORT ?? '4002', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6380',
  },
});
