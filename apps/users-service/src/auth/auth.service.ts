import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@prisma/client-users';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  // ─── Register ────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const passwordHash = await argon2.hash(dto.password);

    const user = await this.usersService.createLocalUser({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
    });

    return this.issueTokenPair(user);
  }

  // ─── Validate credentials (used by LocalStrategy) ────────────

  // Called by Passport's LocalStrategy before login.
  // Returns the user if valid, null if not — Passport handles the rest.
  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) return null;

    const valid = await argon2.verify(user.passwordHash, password);
    return valid ? user : null;
  }

  // ─── Login ───────────────────────────────────────────────────

  async login(user: User, userAgent?: string, ipAddress?: string) {
    // Create a session record so users can see active sessions
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return this.issueTokenPair(user, session.id);
  }

  // ─── Refresh token rotation ──────────────────────────────────

  async refreshTokens(rawRefreshToken: string) {
    // 1. Verify the token signature and expiry
    let payload: any;
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. Hash the incoming token to look it up in the DB
    const tokenHash = await argon2.hash(rawRefreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { family: payload.family, isRevoked: false },
    });

    if (!storedToken) {
      // Token family doesn't exist or already fully revoked
      throw new UnauthorizedException('Refresh token not found');
    }

    // 3. Breach detection — if the hash doesn't match, someone is replaying
    //    an old token from this family. Revoke the entire family immediately.
    const hashMatch = await argon2.verify(
      storedToken.tokenHash,
      rawRefreshToken,
    );
    if (!hashMatch) {
      this.logger.warn(
        `Refresh token reuse detected for user ${storedToken.userId}. Revoking family.`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { family: payload.family },
        data: { isRevoked: true },
      });
      throw new ForbiddenException(
        'Token reuse detected. Please log in again.',
      );
    }

    // 4. Revoke the used token and issue a fresh pair
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    const user = await this.usersService.findById(storedToken.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or suspended');
    }

    return this.issueTokenPair(
      user,
      storedToken.sessionId ?? undefined,
      payload.family,
    );
  }

  // ─── Logout ──────────────────────────────────────────────────

  // Blacklist the access token in Redis so it can't be used for its remaining TTL.
  // We also revoke all refresh tokens for this session.
  async logout(accessToken: string, userId: string, sessionId?: string) {
    const payload = this.jwtService.decode(accessToken) as any;

    if (payload?.jti) {
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redisService.blacklistToken(payload.jti, ttl);
      }
    }

    if (sessionId) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { isActive: false },
      });

      await this.prisma.refreshToken.updateMany({
        where: { sessionId, isRevoked: false },
        data: { isRevoked: true },
      });
    }
  }

  // ─── OAuth login/register ────────────────────────────────────

  async oauthLogin(user: User) {
    return this.issueTokenPair(user);
  }

  // ─── Token issuance (internal) ───────────────────────────────

  // Central place where all tokens are minted.
  // jti (JWT ID) is a unique ID per access token — used for blacklisting on logout.
  // family groups refresh tokens together for rotation breach detection.
  private async issueTokenPair(
    user: User,
    sessionId?: string,
    existingFamily?: string,
  ) {
    const jti = uuidv4();
    const family = existingFamily ?? uuidv4();

    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role, jti },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: (this.configService.get<string>('jwt.accessExpiresIn') ||
          '15m') as any,
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.id, family },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: (this.configService.get<string>('jwt.refreshExpiresIn') ||
          '7d') as any,
      },
    );

    // Store hashed refresh token — raw token only ever lives in the HTTP response
    const tokenHash = await argon2.hash(refreshToken);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        sessionId,
        family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: this.usersService.sanitize(user),
    };
  }

  // ─── Validate access token (used by TCP handler) ─────────────
  // The API gateway calls this via TCP on every request.
  // We verify the signature, check the blacklist, and return the payload.
  async validateAccessToken(token: string) {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const isBlacklisted = await this.redisService.isTokenBlacklisted(
      payload.jti,
    );
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or suspended');
    }

    return this.usersService.sanitize(user);
  }
}
