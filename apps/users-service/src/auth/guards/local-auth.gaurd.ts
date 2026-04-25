import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Triggers LocalStrategy — used on the POST /auth/login endpoint
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
