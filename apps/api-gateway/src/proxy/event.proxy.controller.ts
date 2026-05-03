import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { USERS_SERVICE } from '../clients/clients.module';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { of } from 'rxjs';

// Public routes that don't need auth
const PUBLIC_PATHS = [
  { method: 'GET', path: /^\/v1\/events-service\/events/ },
  { method: 'GET', path: /^\/v1\/events-service\/categories/ },
  { method: 'GET', path: /^\/v1\/events-service\/health/ },
];

@Injectable()
export class EventsProxyMiddleware implements NestMiddleware {
  private proxy: any;

  constructor(@Inject(USERS_SERVICE) private usersClient: ClientProxy) {
    this.proxy = createProxyMiddleware({
      target: 'http://localhost:3002',
      changeOrigin: true,
      pathRewrite: (path) => {
        const rewritten = path.replace('/v1/events-service', '/v1');
        console.log(`Events Proxy: ${path} → ${rewritten}`);
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
        proxyRes: (proxyRes, req) => {
          console.log(
            'events-service responded:',
            proxyRes.statusCode,
            req.url,
          );
        },
        error: (err) => {
          console.error('Events proxy error:', err.message);
        },
      },
    });
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Check if this is a public route — skip auth
    const isPublic = PUBLIC_PATHS.some(
      (p) => p.method === req.method && p.path.test(req.path),
    );

    if (!isPublic) {
      // Validate token here in the middleware, before proxying
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

      // Attach user to request so proxyReq handler can forward it
      (req as any).user = result.user;
    }

    this.proxy(req, res, next);
  }
}
