import type { INestApplication } from '@nestjs/common';
import type { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { JSON_REQUEST_BYTE_LIMIT } from '@indieforge/contracts';

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
    const isUpload =
      request.method === 'POST' &&
      /^\/games\/[^/]+\/(?:upload|cover)\/?$/.test(request.path);
    if (
      contentType !== undefined &&
      contentType !== 'application/json' &&
      !(isUpload && contentType === 'multipart/form-data')
    ) {
      response
        .status(415)
        .json({ statusCode: 415, message: 'Expected application/json' });
      return;
    }
    next();
  });
  // Bounded story/code schemas can exceed Express's default 100 KiB JSON limit.
  const adapter = app.getHttpAdapter() as ExpressAdapter;
  adapter.useBodyParser('json', false, { limit: JSON_REQUEST_BYTE_LIMIT });
}
