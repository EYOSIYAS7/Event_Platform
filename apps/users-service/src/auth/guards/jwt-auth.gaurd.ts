import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Triggers JwtStrategy — used on every protected endpoint
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
