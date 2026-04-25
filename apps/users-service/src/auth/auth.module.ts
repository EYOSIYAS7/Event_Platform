import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { LocalAuthGuard } from './guards/local-auth.gaurd';
import { JwtAuthGuard } from './guards/jwt-auth.gaurd';
import { GoogleAuthGuard } from './guards/google-auth.gaurd';
import { GithubAuthGuard } from './guards/github-auth.gaurd';
import { AuthController } from './auth.controller';

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule],
  providers: [
    AuthService,
    // Strategies
    LocalStrategy,
    JwtStrategy,
    GoogleStrategy,
    GithubStrategy,
    // Guards
    LocalAuthGuard,
    JwtAuthGuard,
    GoogleAuthGuard,
    GithubAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard],
  controllers: [AuthController],
})
export class AuthModule {}
