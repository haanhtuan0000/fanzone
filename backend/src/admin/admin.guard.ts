import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Validates the X-Admin-Token header against the ADMIN_API_TOKEN env var.
 * Refuses every request if ADMIN_API_TOKEN is unset or empty (fail-closed).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_API_TOKEN');
    if (!expected) {
      this.logger.error('ADMIN_API_TOKEN not configured — refusing all admin requests');
      throw new UnauthorizedException('admin API disabled');
    }
    const req = ctx.switchToHttp().getRequest();
    const presented = req.headers['x-admin-token'];
    if (!presented || presented !== expected) {
      throw new UnauthorizedException('invalid admin token');
    }
    return true;
  }
}
