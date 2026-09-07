import { Module } from '@nestjs/common';
import { CoverStorage } from './cover-storage.js';

@Module({
  providers: [{ provide: CoverStorage, useFactory: () => new CoverStorage() }],
  exports: [CoverStorage],
})
export class GameCoversModule {}
