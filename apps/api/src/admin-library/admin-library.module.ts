import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { AdminOnlyGuard } from './admin-only.guard.js';
import { AdminLibraryController } from './admin-library.controller.js';
import {
  ADMIN_LIBRARY_DATABASE,
  AdminLibraryService,
} from './admin-library.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminLibraryController],
  providers: [
    AdminOnlyGuard,
    AdminLibraryService,
    { provide: ADMIN_LIBRARY_DATABASE, useValue: database },
  ],
})
export class AdminLibraryModule {}
