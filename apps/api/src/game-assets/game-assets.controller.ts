import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type CanActivate,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { catchError } from 'rxjs';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { MAX_ASSET_BYTES, type AssetUpload } from './asset-types.js';
import { GameAssetsService } from './game-assets.service.js';

// Multer 2.3 adds these bounds; the Nest/Multer type package predates them.
// This endpoint only accepts flat scalar fields, never bracket paths.
const multipartLimits = {
  fileSize: MAX_ASSET_BYTES + 1,
  files: 1,
  fields: 3,
  fieldNameSize: 64,
  fieldSize: 1024,
  parts: 5,
  fieldNestingDepth: 0,
  fieldArrayIndexLimit: 0,
};

@Injectable()
export class AssetMultipartErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      catchError((error: unknown) => {
        // Nest 12's adapter does not yet map Multer 2.3's new errors to 400.
        if (
          error instanceof Error &&
          ((error.name === 'MulterError' &&
            'code' in error &&
            [
              'INVALID_FIELD_NAME',
              'LIMIT_FIELD_NESTING',
              'LIMIT_FIELD_ARRAY_INDEX',
            ].includes(String(error.code))) ||
            (context.switchToHttp().getRequest<Request>().aborted &&
              error.message === 'Request aborted'))
        ) {
          throw new BadRequestException('Invalid multipart upload');
        }
        throw error;
      }),
    );
  }
}

@Injectable()
export class GameAssetOwnerGuard implements CanActivate {
  constructor(
    @Inject(GameAssetsService) private readonly assets: GameAssetsService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.assets.owned(String(req.params.id), req.user.id);
    return true;
  }
}

@Controller('games/:id/assets')
@UseGuards(JwtAuthGuard, GameAssetOwnerGuard)
export class GameAssetsController {
  constructor(
    @Inject(GameAssetsService) private readonly assets: GameAssetsService,
  ) {}
  @Post()
  @UseInterceptors(
    AssetMultipartErrorInterceptor,
    FileInterceptor('file', {
      preservePath: true,
      limits: multipartLimits,
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
    @UploadedFile() file?: AssetUpload,
  ) {
    return this.assets.upload(id, user.id, body, file);
  }
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.assets.list(id, user.id, query);
  }
  @Get(':assetId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
  ) {
    return this.assets.get(id, user.id, assetId);
  }
  @Patch(':assetId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
  ) {
    return this.assets.update(id, user.id, assetId, body);
  }
  @Delete(':assetId')
  tombstone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
  ) {
    return this.assets.tombstone(id, user.id, assetId);
  }
  @Get(':assetId/content')
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
  ) {
    return this.send(
      response,
      await this.assets.read(id, user.id, assetId, false),
    );
  }
  @Get(':assetId/thumbnail')
  async thumbnail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
  ) {
    return this.send(
      response,
      await this.assets.read(id, user.id, assetId, true),
    );
  }
  private send(
    response: Response,
    file: { content: Buffer; contentType: string },
  ) {
    response.set({
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    response.send(file.content);
  }
}
