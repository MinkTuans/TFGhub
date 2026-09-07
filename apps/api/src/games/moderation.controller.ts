import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReviewGameInput, ReviewRevisionInput } from '@indieforge/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ModerationService } from './moderation.service.js';

@Controller('moderation/games')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  pending() {
    return this.moderation.pending();
  }

  @Post(':id/approve')
  approve(@Param('id') gameId: string, @Body() body: unknown) {
    const input = ReviewRevisionInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid review revision');
    return this.moderation.approve(gameId, input.data);
  }

  @Post(':id/reject')
  reject(@Param('id') gameId: string, @Body() body: unknown) {
    const input = ReviewGameInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid review input');
    return this.moderation.reject(gameId, input.data);
  }
}
