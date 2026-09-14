import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RuntimeService } from './runtime.service.js';

@Controller('runtime')
export class RuntimeController {
  constructor(private readonly runtime: RuntimeService) {}

  @Get(':slug')
  index(@Param('slug') slug: string, @Res() response: Response) {
    return this.send(slug, 'index.html', response);
  }

  @Get(':slug/*path')
  file(
    @Param('slug') slug: string,
    @Param('path') path: string | string[],
    @Res() response: Response,
  ) {
    const asset = Array.isArray(path) ? path.join('/') : path;
    return this.send(slug, asset || 'index.html', response);
  }

  private async send(slug: string, assetPath: string, response: Response) {
    const file = await this.runtime.serve(slug, assetPath);
    if (!file) throw new NotFoundException('Build not found');
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors ${webOrigin}`,
    );
    response.setHeader('Cache-Control', 'public, max-age=60');
    response.status(200).send(file.body);
  }
}
