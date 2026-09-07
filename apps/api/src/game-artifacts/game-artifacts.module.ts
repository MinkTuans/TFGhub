import { Module } from '@nestjs/common';
import { ArtifactStorage } from './artifact-storage.js';

@Module({
  providers: [
    { provide: ArtifactStorage, useFactory: () => new ArtifactStorage() },
  ],
  exports: [ArtifactStorage],
})
export class GameArtifactsModule {}
