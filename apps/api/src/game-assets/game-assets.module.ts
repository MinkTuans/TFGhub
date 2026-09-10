import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AssetStorage } from './asset-storage.js';
import {
  GameAssetsController,
  GameAssetOwnerGuard,
  AssetMultipartErrorInterceptor,
} from './game-assets.controller.js';
import { GameAssetsRepository } from './game-assets.repository.js';
import { GameAssetsService } from './game-assets.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GameAssetsController],
  providers: [
    GameAssetsService,
    GameAssetOwnerGuard,
    AssetMultipartErrorInterceptor,
    { provide: AssetStorage, useFactory: () => new AssetStorage() },
    {
      provide: GameAssetsRepository,
      useFactory: () => new GameAssetsRepository(),
    },
  ],
  exports: [GameAssetsService, GameAssetsRepository],
})
export class GameAssetsModule {}
