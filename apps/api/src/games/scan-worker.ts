import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { scanHtml5Zip } from './build-scanner.js';
import { ObjectStorage } from './object-storage.js';
import {
  VersionsRepository,
  type StoredVersion,
} from './versions.repository.js';

@Injectable()
export class ScanWorker {
  constructor(
    @Inject(VersionsRepository)
    private readonly versions: VersionsRepository,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
  ) {}

  async process(versionId: string): Promise<StoredVersion> {
    const version = await this.versions.findById(versionId);
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== 'SCANNING') {
      throw new ConflictException('Version is not queued for scanning');
    }
    const body = await this.storage.get(version.storageKey);
    if (!body) {
      version.status = 'REJECTED';
      version.findings = 'Upload is missing';
      return this.versions.save(version);
    }
    const scan = await scanHtml5Zip(body);
    version.status = scan.ok ? 'READY' : 'REJECTED';
    version.findings = scan.ok ? '' : scan.findings;
    return this.versions.save(version);
  }
}
