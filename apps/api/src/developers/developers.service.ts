import { Inject, Injectable } from '@nestjs/common';

export type DeveloperProfile = { displayName: string; bio: string };
export type DeveloperProfileInput = DeveloperProfile;

export abstract class DeveloperProfilesRepository {
  abstract findByUserId(userId: string): Promise<DeveloperProfile | null>;
  abstract upsert(
    userId: string,
    input: DeveloperProfileInput,
  ): Promise<DeveloperProfile>;
}

@Injectable()
export class DevelopersService {
  constructor(
    @Inject(DeveloperProfilesRepository)
    private readonly profiles: DeveloperProfilesRepository,
  ) {}

  findMine(userId: string): Promise<DeveloperProfile | null> {
    return this.profiles.findByUserId(userId);
  }

  updateMine(
    userId: string,
    input: DeveloperProfileInput,
  ): Promise<DeveloperProfile> {
    return this.profiles.upsert(userId, input);
  }
}
