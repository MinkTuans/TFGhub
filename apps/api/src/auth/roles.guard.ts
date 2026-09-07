import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      request.user?.role === 'MODERATOR' ||
      request.user?.role === 'ADMIN'
    ) {
      return true;
    }
    throw new ForbiddenException('Moderator access is required');
  }
}
