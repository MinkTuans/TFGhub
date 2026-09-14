import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  CreateDonationInput,
  SandboxDonationWebhookInput,
} from '@indieforge/contracts';
import { type AuthenticatedUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DonationsService } from './donations.service.js';

@Controller()
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  @Post('games/:slug/donations')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    const input = CreateDonationInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid donation input');
    return this.donations.create(slug, user.id, input.data);
  }

  @Post('donations/:id/sandbox-pay')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  sandboxPay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') donationId: string,
  ) {
    return this.donations.sandboxPay(donationId, user.id);
  }

  @Post('donations/webhooks/sandbox')
  @HttpCode(200)
  webhook(
    @Headers('x-sandbox-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    const expected = process.env.SANDBOX_DONATION_WEBHOOK_SECRET?.trim();
    if (!expected || secret !== expected) {
      throw new UnauthorizedException();
    }
    const input = SandboxDonationWebhookInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid webhook input');
    return this.donations.applyWebhook(input.data);
  }

  @Get('donations/received')
  @UseGuards(JwtAuthGuard)
  received(@CurrentUser() user: AuthenticatedUser) {
    return this.donations.listReceived(user.id);
  }
}
