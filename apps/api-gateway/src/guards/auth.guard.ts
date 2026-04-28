import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { of } from 'rxjs';
import { USERS_SERVICE } from '../clients/clients.module';
import { Reflector } from '@nestjs/core';

// Decorator to mark routes as public — skips token validation
export const IS_PUBLIC = 'isPublic';
export const Public = () => (target: any, key?: any, descriptor?: any) => {
  if (descriptor) {
    Reflect.defineMetadata(IS_PUBLIC, true, descriptor.value);
    return descriptor;
  }
  Reflect.defineMetadata(IS_PUBLIC, true, target);
};

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(
    @Inject(USERS_SERVICE) private usersClient: ClientProxy,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip auth for routes decorated with @Public()
    const isPublic = this.reflector.get<boolean>(
      IS_PUBLIC,
      context.getHandler(),
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const token = authHeader.split(' ')[1];

    // Call users-service via TCP to validate the token.
    // timeout(5000) ensures we don't hang forever if users-service is down.
    const result = await firstValueFrom(
      this.usersClient
        .send<{ valid: boolean; user: any }>('validate_token', { token })
        .pipe(
          timeout(5000),
          catchError(() => of({ valid: false, user: null })),
        ),
    );

    if (!result.valid) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Attach the validated user to the request so proxy controllers can forward it
    request.user = result.user;
    return true;
  }
}
