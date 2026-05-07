import { Injectable, NestMiddleware } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { USERS_SERVICE } from '../clients/clients.module';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';

@Injectable()
export class BookingsProxyMiddleware implements NestMiddleware {
  private proxy: any;

  constructor(@Inject(USERS_SERVICE) private usersClient: ClientProxy) {
    this.proxy = createProxyMiddleware({
      target: 'http://localhost:3003',
      changeOrigin: true,
      pathRewrite: (path) => {
        const rewritten = path.replace('/v1/bookings-service', '/v1');
        console.log(`Bookings Proxy: ${path} → ${rewritten}`);
        return rewritten;
      },
      on: {
        proxyReq: (proxyReq, req: any) => {
          if (req.user) {
            proxyReq.setHeader('x-user-id', req.user.id);
            proxyReq.setHeader('x-user-email', req.user.email);
            proxyReq.setHeader('x-user-role', req.user.role);
          }
        },
        error: (err) => console.error('Bookings proxy error:', err.message),
      },
    });
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // All booking routes require authentication
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ message: 'Missing authorization header', statusCode: 401 });
      return;
    }

    const token = authHeader.split(' ')[1];
    const result = await firstValueFrom(
      this.usersClient
        .send<{ valid: boolean; user: any }>('validate_token', { token })
        .pipe(
          timeout(5000),
          catchError(() => of({ valid: false, user: null })),
        ),
    );

    if (!result.valid) {
      res
        .status(401)
        .json({ message: 'Invalid or expired token', statusCode: 401 });
      return;
    }

    (req as any).user = result.user;
    this.proxy(req, res, next);
  }
}
