import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { AchievementService } from './achievement.service';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private achievementService: AchievementService,
  ) {}

  @Get('me')
  async getMyProfile(@Request() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @Get('me/achievements')
  async getMyAchievements(@Request() req: any) {
    return this.achievementService.getUserAchievements(req.user.id);
  }

  @Get('me/activity')
  async getMyActivity(@Request() req: any, @Query('page') page: string = '1') {
    return this.usersService.getActivity(req.user.id, parseInt(page));
  }

  @Get(':userId')
  async getProfile(@Param('userId') userId: string) {
    return this.usersService.getPublicProfile(userId);
  }
}
