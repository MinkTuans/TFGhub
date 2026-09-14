import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AppealReportInput,
  CreateReportInput,
  ResolveReportInput,
} from '@indieforge/contracts';
import { type AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ReportsService } from './reports.service.js';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('games/:slug/reports')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    const input = CreateReportInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid report input');
    return this.reports.create(slug, user.id, input.data);
  }

  @Get('reports/mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.listForOwner(user.id);
  }

  @Get('moderation/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN')
  queue() {
    return this.reports.listQueue();
  }

  @Post('moderation/reports/:id/quarantine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN')
  quarantine(@Param('id') id: string, @Body() body: unknown) {
    const input = ResolveReportInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid resolution');
    return this.reports.quarantine(id, input.data.reason);
  }

  @Post('moderation/reports/:id/dismiss')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN')
  dismiss(@Param('id') id: string, @Body() body: unknown) {
    const input = ResolveReportInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid resolution');
    return this.reports.dismiss(id, input.data.reason);
  }

  @Post('moderation/reports/:id/restore')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MODERATOR', 'ADMIN')
  restore(@Param('id') id: string, @Body() body: unknown) {
    const input = ResolveReportInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid resolution');
    return this.reports.restore(id, input.data.reason);
  }

  @Post('moderation/reports/:id/appeal')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  appeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = AppealReportInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid appeal');
    return this.reports.appeal(id, user.id, input.data.message);
  }
}
