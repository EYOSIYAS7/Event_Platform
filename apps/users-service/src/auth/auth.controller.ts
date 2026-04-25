import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import express from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { LocalAuthGuard } from './guards/local-auth.gaurd';
import { JwtAuthGuard } from './guards/jwt-auth.gaurd';
import { GoogleAuthGuard } from './guards/google-auth.gaurd';
import { GithubAuthGuard } from './guards/github-auth.gaurd';
import { UnauthorizedException } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  // ─── HTTP: Register ──────────────────────────────────────────
  // No guard here — this is a public endpoint.
  // ValidationPipe (set globally in main.ts) handles DTO validation automatically.
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── HTTP: Login ─────────────────────────────────────────────
  // LocalAuthGuard runs first — it triggers LocalStrategy which calls
  // authService.validateLocalUser(). If that passes, req.user is populated
  // and we reach this handler. If it fails, Passport throws 401 automatically.
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK) // Override default 201 POST → 200 for login
  async login(@Req() req: express.Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.login(req.user as any, userAgent, ipAddress);
  }

  // ─── HTTP: Refresh tokens ────────────────────────────────────
  // No guard — the refresh token IS the credential here.
  // We validate it inside authService.refreshTokens() itself.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  // ─── HTTP: Logout ────────────────────────────────────────────
  // JwtAuthGuard protects this — you must be authenticated to log out.
  // We extract the raw Bearer token from the Authorization header to blacklist it.
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: express.Request) {
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader?.split(' ')[1];
    const user = req.user as any;

    if (!accessToken) {
      throw new UnauthorizedException('No access token found');
    }

    await this.authService.logout(accessToken, user.id, user.sessionId);
    return { message: 'Logged out successfully' };
  }

  // ─── HTTP: Get current user ──────────────────────────────────
  // A convenience endpoint — returns the authenticated user's profile.
  // Useful for the frontend to hydrate the current user on app load.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: express.Request) {
    const user = req.user as any;
    const fullUser = await this.usersService.findById(user.id);
    return this.usersService.sanitize(fullUser!);
  }

  // ─── HTTP: Google OAuth — initiate ──────────────────────────
  // This endpoint doesn't return anything to our app.
  // GoogleAuthGuard redirects the browser to Google's consent screen.
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {}

  // ─── HTTP: Google OAuth — callback ──────────────────────────
  // Google redirects here after the user approves.
  // GoogleAuthGuard handles the code exchange and populates req.user
  // via GoogleStrategy.validate() which calls usersService.findOrCreateOAuthUser().
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    const tokens = await this.authService.oauthLogin(req.user as any);

    // In a real app you'd redirect to the frontend with tokens in query params
    // or set them as httpOnly cookies. For now we return JSON.
    return res.json(tokens);
  }

  // ─── HTTP: GitHub OAuth — initiate ──────────────────────────
  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubLogin() {}

  // ─── HTTP: GitHub OAuth — callback ──────────────────────────
  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    const tokens = await this.authService.oauthLogin(req.user as any);
    return res.json(tokens);
  }

  // ═══════════════════════════════════════════════════════════════
  // TCP MESSAGE HANDLERS
  // These are NOT HTTP endpoints. They're called by other services
  // internally over NestJS TCP transport — never exposed to the internet.
  // The API gateway calls these to validate tokens and fetch users
  // before forwarding requests to other services.
  // ═══════════════════════════════════════════════════════════════

  // ─── TCP: Validate access token ─────────────────────────────
  // The API gateway calls this on every incoming request.
  // It sends the raw Bearer token and we tell it whether it's valid
  // and who the user is — so the gateway doesn't need JWT logic itself.
  @MessagePattern('validate_token')
  async validateToken(@Payload() data: { token: string }) {
    try {
      const result = await this.authService.validateAccessToken(data.token);
      return { valid: true, user: result };
    } catch {
      return { valid: false, user: null };
    }
  }

  // ─── TCP: Get user by ID ─────────────────────────────────────
  // Called by bookings-service, events-service etc. when they need
  // to enrich a response with user details (name, email, avatar).
  // They only store userId — they call us to resolve the full profile.
  @MessagePattern('get_user')
  async getUser(@Payload() data: { userId: string }) {
    const user = await this.usersService.findById(data.userId);
    if (!user) return null;
    return this.usersService.sanitize(user);
  }
}
