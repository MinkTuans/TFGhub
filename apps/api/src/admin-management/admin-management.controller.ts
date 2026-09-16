import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminUsersQuery,
  AdminUserCreateInput,
  AdminUserUpdateInput,
  AdminUserDeleteInput,
  AdminGamesQuery,
  AdminGameUpdateInput,
  AdminGameDeleteInput,
} from '@indieforge/contracts';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { AdminOnlyGuard } from '../admin-library/admin-only.guard.js';
import { AdminManagementService } from './admin-management.service.js';
function parse<T>(
  schema: {
    safeParse(input: unknown): { success: true; data: T } | { success: false };
  },
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
    );
  return parsed.data;
}
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminManagementController {
  constructor(
    @Inject(AdminManagementService)
    private readonly management: AdminManagementService,
  ) {}
  @Get('users')
  @Header('Cache-Control', 'private, no-store')
  users(@Query() query: unknown) {
    return this.management.users(parse(AdminUsersQuery, query));
  }
  @Get('users/:id')
  @Header('Cache-Control', 'private, no-store')
  user(@Param('id') id: string) {
    return this.management.user(id);
  }
  @Post('users')
  createUser(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.management.createUser(
      request.user.id,
      parse(AdminUserCreateInput, body),
    );
  }
  @Patch('users/:id')
  updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.management.updateUser(
      request.user.id,
      id,
      parse(AdminUserUpdateInput, body),
    );
  }
  @Delete('users/:id')
  @HttpCode(204)
  deleteUser(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.management.deleteUser(
      request.user.id,
      id,
      parse(AdminUserDeleteInput, body),
    );
  }
  @Get('games')
  @Header('Cache-Control', 'private, no-store')
  games(@Query() query: unknown) {
    return this.management.games(parse(AdminGamesQuery, query));
  }
  @Get('games/:id')
  @Header('Cache-Control', 'private, no-store')
  game(@Param('id') id: string) {
    return this.management.game(id);
  }
  @Patch('games/:id')
  updateGame(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.management.updateGame(
      request.user.id,
      id,
      parse(AdminGameUpdateInput, body),
    );
  }
  @Delete('games/:id')
  @HttpCode(204)
  deleteGame(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.management.deleteGame(
      request.user.id,
      id,
      parse(AdminGameDeleteInput, body),
    );
  }
}
