import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Custom Redis storage adapter for the throttler.
// The default in-memory store would reset on each restart and
// wouldn't be shared between multiple gateway instances.
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis(this.configService.get<string>('redis.url')!);
  }

  async increment(
    key: string,
    ttl: number,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }> {
    const multi = this.redis.multi();
    multi.incr(key);
    multi.pttl(key);
    const results = await multi.exec();

    const totalHits = (results?.[0]?.[1] as number) ?? 1;
    let timeToExpire = (results?.[1]?.[1] as number) ?? 0;

    // Set expiry only on first hit
    if (totalHits === 1) {
      await this.redis.pexpire(key, ttl);
      timeToExpire = ttl;
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
