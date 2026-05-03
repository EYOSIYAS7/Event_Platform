import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole } from '@prisma/client-users';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // Used by OAuth strategies — find existing account or create a new one
  async findOrCreateOAuthUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    provider: 'GOOGLE' | 'GITHUB';
    providerId: string;
  }): Promise<User> {
    const existing = await this.prisma.user.findFirst({
      where: { provider: data.provider, providerId: data.providerId },
    });

    if (existing) return existing;

    // Also check if the email already exists under a different provider
    const emailConflict = await this.findByEmail(data.email);
    if (emailConflict) {
      throw new ConflictException(
        `An account with this email already exists. Please log in with ${emailConflict.provider}.`,
      );
    }

    return this.prisma.user.create({
      data: {
        ...data,
        isVerified: true, // OAuth emails are pre-verified by the provider
      },
    });
  }

  async createLocalUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
  }): Promise<User> {
    const existing = await this.findByEmail(data.email);
    if (existing) throw new ConflictException('Email already in use');

    return this.prisma.user.create({ data });
  }

  // Safe public projection — never return passwordHash over the wire
  sanitize(user: User) {
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
