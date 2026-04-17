import { IsIn, IsString, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  fcmToken: string;

  @IsIn(['ANDROID', 'IOS'])
  platform: 'ANDROID' | 'IOS';
}

export class UnregisterDeviceDto {
  @IsString()
  @MinLength(10)
  fcmToken: string;
}
