import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Put,
  UseGuards,
} from '@nestjs/common';
import { DeveloperProfileInput } from '@indieforge/contracts';
import { type AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DevelopersService } from './developers.service.js';

@Controller('developers')
@UseGuards(JwtAuthGuard)
export class DevelopersController {
  constructor(private readonly developers: DevelopersService) {}

  @Get('me')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.developers.findMine(user.id);
    if (!profile) throw new NotFoundException('Developer profile not found');
    return profile;
  }

  @Put('me')
  update(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = DeveloperProfileInput.safeParse(body);
    if (!input.success) {
      throw new BadRequestException('Invalid developer profile input');
    }
    return this.developers.updateMine(user.id, input.data);
  }
}
