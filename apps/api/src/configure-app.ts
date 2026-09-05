import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';

export function configureApp(app: INestApplication): void {
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  app.use(cookieParser());
  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();

    // CORS controls response access, not whether a simple form POST executes.
    // Browsers must identify the trusted caller; JSON CLI clients may omit Origin.
    const origin = request.get('Origin');
    if (
      (origin !== undefined && origin !== webOrigin) ||
      (origin === undefined && request.get('Sec-Fetch-Site') !== undefined)
    ) {
      response
        .status(403)
        .json({ statusCode: 403, message: 'Untrusted request origin' });
      return;
    }

    const contentType = request
      .get('Content-Type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType !== undefined && contentType !== 'application/json') {
      response
        .status(415)
        .json({ statusCode: 415, message: 'Expected application/json' });
      return;
    }
    next();
  });
}
