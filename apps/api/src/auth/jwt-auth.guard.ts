import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthService, type AuthenticatedUser } from './auth.service.js';

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
export const ACCESS_COOKIE = 'indieforge_access';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly tokens: JwtService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException();

    let payload: { sub?: unknown; role?: unknown };
    try {
      payload = await this.tokens.verifyAsync(token);
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        !['USER', 'MODERATOR', 'ADMIN'].includes(payload.role as string)
      )
        throw new UnauthorizedException();
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.auth.findUser(payload.sub as string);
    if (!user) throw new UnauthorizedException();
    request.user = user;
    return true;
  }
}
