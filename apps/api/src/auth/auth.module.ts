import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { database } from '@indieforge/database';
import { AuthController } from './auth.controller.js';
import {
  Argon2PasswordHasher,
  AuthService,
  AuthUsersRepository,
  PasswordHasher,
} from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret?.trim()) throw new Error('JWT_SECRET must be configured');
        return {
          secret,
          signOptions: { expiresIn: '15m', algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    {
      provide: AuthUsersRepository,
      useFactory: (): AuthUsersRepository => ({
        create: (data) => database.user.create({ data }),
        findByEmail: (email) => database.user.findUnique({ where: { email } }),
        findById: (id) =>
          database.user.findUnique({
            where: { id },
            select: { id: true, email: true, role: true },
          }),
      }),
    },
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
