import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  fcmToken: string;

  @IsIn(['ANDROID', 'IOS'])
  platform: 'ANDROID' | 'IOS';

  /**
   * Device language — `'vi'` or `'en'`. Omitted / unknown values fall
   * back to `'vi'` server-side via `pickLocale`, so older client builds
   * that don't send this field keep working unchanged.
   */
  @IsOptional()
  @IsString()
  locale?: string;
}

export class UnregisterDeviceDto {
  @IsString()
  @MinLength(10)
  fcmToken: string;
}
