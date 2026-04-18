import { Body, Controller, Delete, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceDto, UnregisterDeviceDto } from './dto/register-device.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Post('device')
  async register(@Request() req: any, @Body() dto: RegisterDeviceDto) {
    return this.svc.registerDevice(req.user.id, dto.fcmToken, dto.platform, dto.locale);
  }

  @Delete('device')
  async unregister(@Request() req: any, @Body() dto: UnregisterDeviceDto) {
    await this.svc.unregisterDevice(req.user.id, dto.fcmToken);
    return { ok: true };
  }
}
