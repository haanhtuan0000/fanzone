import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Retry connection up to 5 times (Neon free tier cold starts can take a few seconds)
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
        this.logger.log(`Database connected (attempt ${attempt})`);
        return;
      } catch (e) {
        this.logger.warn(`Database connection attempt ${attempt}/5 failed: ${e.message}`);
        if (attempt === 5) throw e;
        await new Promise((r) => setTimeout(r, attempt * 2000)); // 2s, 4s, 6s, 8s
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
