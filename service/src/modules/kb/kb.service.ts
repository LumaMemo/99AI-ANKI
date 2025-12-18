import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { KbQuotaResponseDto } from './dto/kbQuota.dto';
import { KbUserUsageEntity } from './kbUserUsage.entity';

const DEFAULT_FREE_QUOTA_BYTES = 50 * 1024 * 1024;

@Injectable()
export class KbService {
  constructor(
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceRepo: Repository<UserBalanceEntity>,
    @InjectRepository(CramiPackageEntity)
    private readonly packageRepo: Repository<CramiPackageEntity>,
    @InjectRepository(KbUserUsageEntity)
    private readonly usageRepo: Repository<KbUserUsageEntity>,
  ) {}

  private toNumber(value: unknown, defaultValue = 0): number {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }
    return defaultValue;
  }

  async getQuota(userId: number): Promise<KbQuotaResponseDto> {
    // 1) quotaBytes
    let quotaBytes = DEFAULT_FREE_QUOTA_BYTES;

    const balance = await this.userBalanceRepo.findOne({ where: { userId } });
    const packageId = balance?.packageId ?? 0;

    if (packageId && packageId !== 0) {
      const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
      if (pkg) {
        quotaBytes = this.toNumber(pkg.kbQuotaBytes, DEFAULT_FREE_QUOTA_BYTES);
      }
    }

    // 2) usedBytes（不存在则初始化）
    let usage = await this.usageRepo.findOne({ where: { userId } });
    if (!usage) {
      usage = this.usageRepo.create({ userId, usedBytes: 0 });
      await this.usageRepo.save(usage);
    }

    const usedBytes = this.toNumber(usage.usedBytes, 0);
    const remainingBytes = Math.max(quotaBytes - usedBytes, 0);

    return {
      quotaBytes,
      usedBytes,
      remainingBytes,
    };
  }
}
