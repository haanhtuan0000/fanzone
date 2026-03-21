import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis;

  constructor(private config: ConfigService) {
    this.client = new Redis(this.config.get<string>('REDIS_URL') || 'redis://localhost:6379');
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, score, member);
  }

  async zrevrangeWithScores(key: string, start: number, stop: number): Promise<Array<{ member: string; score: number }>> {
    const result = await this.client.zrevrange(key, start, stop, 'WITHSCORES');
    const entries: Array<{ member: string; score: number }> = [];
    for (let i = 0; i < result.length; i += 2) {
      entries.push({ member: result[i], score: parseFloat(result[i + 1]) });
    }
    return entries;
  }

  async zrevrank(key: string, member: string): Promise<number | null> {
    return this.client.zrevrank(key, member);
  }

  async zscore(key: string, member: string): Promise<number | null> {
    const score = await this.client.zscore(key, member);
    return score ? parseFloat(score) : null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return this.client.hincrby(key, field, increment);
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    await this.client.sadd(key, ...members);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
