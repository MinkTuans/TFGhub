import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@indieforge/database';
import { argon2id, hash, verify } from 'argon2';

export type AuthenticatedUser = { id: string; email: string; role: UserRole };
export type StoredUser = AuthenticatedUser & { passwordHash: string };
type Credentials = { email: string; password: string };

export abstract class AuthUsersRepository {
  abstract create(input: {
    email: string;
    passwordHash: string;
  }): Promise<StoredUser>;
  abstract findByEmail(email: string): Promise<StoredUser | null>;
  abstract findById(id: string): Promise<AuthenticatedUser | null>;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(passwordHash: string, password: string): Promise<boolean>;
}

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}

function publicUser(user: AuthenticatedUser): AuthenticatedUser {
  return { id: user.id, email: user.email, role: user.role };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthUsersRepository) private readonly users: AuthUsersRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(JwtService) private readonly tokens: Pick<JwtService, 'signAsync'>,
  ) {}

  async register(input: Credentials) {
    const passwordHash = await this.hasher.hash(input.password);
    let user: StoredUser;
    try {
      user = await this.users.create({
        email: input.email.trim().toLowerCase(),
        passwordHash,
      });
    } catch (error) {
      const failure = error as {
        code?: unknown;
        meta?: { target?: unknown };
      } | null;
      if (
        failure?.code === 'P2002' &&
        Array.isArray(failure.meta?.target) &&
        failure.meta.target.includes('email')
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
    return this.session(user);
  }

  async login(input: Credentials) {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    if (
      !user ||
      !(await this.hasher.verify(user.passwordHash, input.password))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.session(user);
  }

  async findUser(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.users.findById(id);
    return user ? publicUser(user) : null;
  }

  private async session(user: StoredUser) {
    const accessToken = await this.tokens.signAsync({
      sub: user.id,
      role: user.role,
    });
    return { user: publicUser(user), accessToken };
  }
}
