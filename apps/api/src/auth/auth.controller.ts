import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { LoginInput, RegisterInput } from '@indieforge/contracts';
import type { CookieOptions, Response } from 'express';
import { AuthService, type AuthenticatedUser } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { ACCESS_COOKIE, JwtAuthGuard } from './jwt-auth.guard.js';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.COOKIE_SECURE !== 'false',
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = RegisterInput.safeParse(body);
    if (!input.success)
      throw new BadRequestException('Invalid registration input');
    const session = await this.auth.register(input.data);
    response.cookie(ACCESS_COOKIE, session.accessToken, {
      ...cookieOptions(),
    });
    return session.user;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = LoginInput.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid login input');
    const session = await this.auth.login(input.data);
    response.cookie(ACCESS_COOKIE, session.accessToken, {
      ...cookieOptions(),
    });
    return session.user;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(ACCESS_COOKIE, cookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
