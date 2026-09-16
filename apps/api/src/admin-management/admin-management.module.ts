import { Module } from '@nestjs/common';
import { database } from '@indieforge/database';
import { AuthModule } from '../auth/auth.module.js';
import { AdminOnlyGuard } from '../admin-library/admin-only.guard.js';
import { AdminManagementController } from './admin-management.controller.js';
import {
  ADMIN_MANAGEMENT_DATABASE,
  AdminManagementService,
} from './admin-management.service.js';
@Module({
  imports: [AuthModule],
  controllers: [AdminManagementController],
  providers: [
    AdminOnlyGuard,
    AdminManagementService,
    { provide: ADMIN_MANAGEMENT_DATABASE, useValue: database },
  ],
})
export class AdminManagementModule {}
