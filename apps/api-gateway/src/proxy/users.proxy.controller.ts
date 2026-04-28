import { Injectable, NestMiddleware } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class UsersProxyMiddleware implements NestMiddleware {
  private proxy: any;

  constructor() {
    this.proxy = createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      // Preserve the original host header
      preserveHeaderKeyCase: true,
      pathRewrite: (path) => {
        const rewritten = path.replace('/v1/users', '/v1');
        console.log(`Proxy: ${path} → ${rewritten}`);
        return rewritten;
      },
      on: {
        // Log what users-service actually responds with
        proxyRes: (proxyRes, req, res) => {
          console.log('users-service responded:', proxyRes.statusCode, req.url);
        },
        // Log any proxy errors
        error: (err, req, res) => {
          console.error('Proxy error:', err.message);
        },
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    console.log('Middleware hit:', req.method, req.url);
    this.proxy(req, res, next);
  }
}
