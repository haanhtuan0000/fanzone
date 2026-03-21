import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$2b$12$hashedpassword',
    displayName: 'test',
    avatarEmoji: '⚽',
    coins: 1000,
    currentXp: 50,
    level: 1,
    refreshToken: '$2b$12$hashedrefreshtoken',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('register', () => {
    const registerDto = {
      email: 'new@example.com',
      password: 'password123',
      displayName: 'NewUser',
    };

    it('should create user, hash password, and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$hashed');
      mockPrisma.user.create.mockResolvedValue({
        ...mockUser,
        id: 'new-user-1',
        email: registerDto.email,
        displayName: registerDto.displayName,
      });
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token-123')
        .mockResolvedValueOnce('refresh-token-123');
      mockPrisma.user.update.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('refresh-secret');

      const result = await service.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: registerDto.email,
          passwordHash: '$2b$12$hashed',
          displayName: registerDto.displayName,
        },
      });
      expect(result).toHaveProperty('accessToken', 'access-token-123');
      expect(result).toHaveProperty('refreshToken', 'refresh-token-123');
      expect(result.user).toHaveProperty('email', registerDto.email);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto = { email: 'test@example.com', password: 'password123' };

    it('should return tokens for valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$newhashedrefresh');
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token-456')
        .mockResolvedValueOnce('refresh-token-456');
      mockPrisma.user.update.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('refresh-secret');

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken', 'access-token-456');
      expect(result).toHaveProperty('refreshToken', 'refresh-token-456');
      expect(result.user).toHaveProperty('id', mockUser.id);
      expect(result.user).toHaveProperty('email', mockUser.email);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for nonexistent email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    const refreshToken = 'valid-refresh-token';

    it('should return new tokens for a valid refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com' });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$newhashedrefresh');
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      mockPrisma.user.update.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('refresh-secret');

      const result = await service.refreshTokens(refreshToken);

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken', 'new-refresh-token');
      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken, {
        secret: 'refresh-secret',
      });
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'nonexistent', email: 'x@x.com' });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue('refresh-secret');

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if stored refresh token does not match', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com' });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockConfigService.get.mockReturnValue('refresh-secret');

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
