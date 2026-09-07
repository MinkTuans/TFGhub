import { Module } from '@nestjs/common';
import { ArtifactStorage } from './artifact-storage.js';

@Module({
  providers: [ArtifactStorage],
  exports: [ArtifactStorage],
})
export class GameArtifactsModule {}
