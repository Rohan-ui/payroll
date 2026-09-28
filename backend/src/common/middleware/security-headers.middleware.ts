import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Baseline security headers for API responses.
 *
 * These responses are JSON rather than documents, but the headers still matter:
 * a browser that is tricked into treating a response as a document, or a page
 * that frames the API, becomes a way to read tenant data. The policy is
 * deliberately restrictive because nothing here should ever render or execute.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    // Nothing served by the API may load, frame or execute anything.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    // Responses carry tenant and payroll data; never let a shared cache keep them.
    res.setHeader('Cache-Control', 'no-store');

    // Only meaningful over TLS, and harmless otherwise.
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  }
}
