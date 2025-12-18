import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { KbFolderCreateDto } from './dto/kbFolderCreate.dto';
import { KbFolderRenameDto } from './dto/kbFolderRename.dto';
import { KbFileListResponseDto } from './dto/kbFileList.dto';
import { KbFolderTreeNodeDto } from './dto/kbFolderTree.dto';
import { KbQuotaResponseDto } from './dto/kbQuota.dto';
import { KbFolderEntity } from './kbFolder.entity';
import { KbPdfEntity } from './kbPdf.entity';
import { KbUserUsageEntity } from './kbUserUsage.entity';

const DEFAULT_FREE_QUOTA_BYTES = 50 * 1024 * 1024;
const DEFAULT_KB_COS_PREFIX = 'kb';
const DEFAULT_KB_COS_SIGNED_URL_EXPIRES_SECONDS = 60;
const DEFAULT_KB_SINGLE_PDF_MAX_BYTES = 100 * 1024 * 1024;

type KbCosConfig = {
  enabled: boolean;
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  prefix: string;
  signedUrlExpiresSeconds: number;
  singlePdfMaxBytes: number;
};

@Injectable()
export class KbService {
  constructor(
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceRepo: Repository<UserBalanceEntity>,
    @InjectRepository(CramiPackageEntity)
    private readonly packageRepo: Repository<CramiPackageEntity>,
    @InjectRepository(KbUserUsageEntity)
    private readonly usageRepo: Repository<KbUserUsageEntity>,
    @InjectRepository(KbFolderEntity)
    private readonly folderRepo: Repository<KbFolderEntity>,
    @InjectRepository(KbPdfEntity)
    private readonly pdfRepo: Repository<KbPdfEntity>,
    private readonly globalConfigService: GlobalConfigService,
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

  private toPositiveIntOrUndefined(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    const intVal = Math.floor(parsed);
    if (intVal <= 0) return undefined;
    return intVal;
  }

  private toTrimmedString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private async readKbCosConfigRaw() {
    return (await this.globalConfigService.getConfigs([
      'kbTencentCosStatus',
      'kbCosSecretId',
      'kbCosSecretKey',
      'kbCosBucket',
      'kbCosRegion',
      'kbCosPrefix',
      'kbCosSignedUrlExpiresSeconds',
      'kbSinglePdfMaxBytes',
    ])) as Record<string, any>;
  }

  private buildKbCosConfigFromRaw(raw: Record<string, any>): KbCosConfig {
    const enabled = Number(raw?.kbTencentCosStatus ?? 0) === 1;

    const prefixRaw = this.toTrimmedString(raw?.kbCosPrefix);
    const prefix = prefixRaw || DEFAULT_KB_COS_PREFIX;

    const expiresOptional = this.toPositiveIntOrUndefined(raw?.kbCosSignedUrlExpiresSeconds);
    const signedUrlExpiresSeconds =
      expiresOptional ?? DEFAULT_KB_COS_SIGNED_URL_EXPIRES_SECONDS;

    const maxBytesOptional = this.toPositiveIntOrUndefined(raw?.kbSinglePdfMaxBytes);
    const singlePdfMaxBytes = maxBytesOptional ?? DEFAULT_KB_SINGLE_PDF_MAX_BYTES;

    return {
      enabled,
      secretId: this.toTrimmedString(raw?.kbCosSecretId),
      secretKey: this.toTrimmedString(raw?.kbCosSecretKey),
      bucket: this.toTrimmedString(raw?.kbCosBucket),
      region: this.toTrimmedString(raw?.kbCosRegion),
      prefix,
      signedUrlExpiresSeconds,
      singlePdfMaxBytes,
    };
  }

  /**
   * 读取 KB 腾讯云 COS 配置（不抛错：用于不依赖 COS 的接口提前 warm-up / 兜底默认值）
   */
  private async getKbCosConfig(): Promise<KbCosConfig> {
    const raw = await this.readKbCosConfigRaw();
    return this.buildKbCosConfigFromRaw(raw);
  }

  /**
   * 读取并校验 KB 腾讯云 COS 配置（会抛出“可解释”的 400 错误，供上传/签名 URL 等依赖 COS 的接口调用）
   */
  private async getKbCosConfigOrThrow(): Promise<KbCosConfig> {
    const raw = await this.readKbCosConfigRaw();
    const cfg = this.buildKbCosConfigFromRaw(raw);

    if (!cfg.enabled) {
      throw new BadRequestException(
        '知识库腾讯云 COS 未启用：请在后台系统配置 configKey=kbTencentCosStatus 为 1',
      );
    }

    const missingKeys: string[] = [];
    if (!cfg.secretId) missingKeys.push('kbCosSecretId');
    if (!cfg.secretKey) missingKeys.push('kbCosSecretKey');
    if (!cfg.bucket) missingKeys.push('kbCosBucket');
    if (!cfg.region) missingKeys.push('kbCosRegion');

    if (missingKeys.length > 0) {
      throw new BadRequestException(
        `知识库腾讯云 COS 配置缺失：${missingKeys.join(', ')}。请在后台系统的 config 表补齐这些 configKey`,
      );
    }

    // 数值配置存在但非法时给出可解释错误（缺省则走默认值）
    if (
      raw?.kbCosSignedUrlExpiresSeconds !== null &&
      raw?.kbCosSignedUrlExpiresSeconds !== undefined &&
      String(raw?.kbCosSignedUrlExpiresSeconds).trim() !== '' &&
      !this.toPositiveIntOrUndefined(raw?.kbCosSignedUrlExpiresSeconds)
    ) {
      throw new BadRequestException(
        '知识库腾讯云 COS 配置非法：kbCosSignedUrlExpiresSeconds 必须为正整数（单位：秒）',
      );
    }
    if (
      raw?.kbSinglePdfMaxBytes !== null &&
      raw?.kbSinglePdfMaxBytes !== undefined &&
      String(raw?.kbSinglePdfMaxBytes).trim() !== '' &&
      !this.toPositiveIntOrUndefined(raw?.kbSinglePdfMaxBytes)
    ) {
      throw new BadRequestException(
        '知识库腾讯云 COS 配置非法：kbSinglePdfMaxBytes 必须为正整数（单位：字节）',
      );
    }

    return cfg;
  }

  async getQuota(userId: number): Promise<KbQuotaResponseDto> {
    // Step 7：触发一次配置读取（不校验、不影响配额接口返回）
    await this.getKbCosConfig();

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

  private normalizeFolderName(name: string): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new BadRequestException('文件夹名称不能为空');
    if (trimmed.length > 255) throw new BadRequestException('文件夹名称过长');
    return trimmed;
  }

  private toPathSegment(name: string): string {
    // 保留中英文/数字等可读字符；仅做最小安全处理，避免影响展示
    const normalized = name
      .trim()
      .replace(/[\\/]+/g, '-')
      .replace(/[\u0000-\u001F]/g, '')
      .replace(/\s+/g, ' ');
    return normalized || 'folder';
  }

  private joinPath(parentPath: string, name: string): string {
    const segment = this.toPathSegment(name);
    const base = parentPath && parentPath !== '/' ? parentPath : '';
    return `${base}/${segment}`;
  }

  async getFoldersTree(userId: number): Promise<KbFolderTreeNodeDto> {
    const folders = await this.folderRepo.find({ where: { userId }, order: { sortOrder: 'ASC', id: 'ASC' } });

    const byId = new Map<number, KbFolderTreeNodeDto>();
    for (const folder of folders) {
      byId.set(folder.id, { id: folder.id, name: folder.name, children: [] });
    }

    const root: KbFolderTreeNodeDto = { id: 0, name: '根目录', children: [] };
    for (const folder of folders) {
      const node = byId.get(folder.id);
      if (!node) continue;
      const parentId = Number(folder.parentId ?? 0);
      if (!parentId || parentId === 0) {
        root.children.push(node);
        continue;
      }
      const parent = byId.get(parentId);
      if (parent) parent.children.push(node);
      else root.children.push(node);
    }
    return root;
  }

  async createFolder(userId: number, body: KbFolderCreateDto) {
    const parentId = Number(body?.parentId ?? 0);
    const name = this.normalizeFolderName(body?.name);

    let parentPath = '';
    if (parentId !== 0) {
      const parent = await this.folderRepo.findOne({ where: { id: parentId, userId } });
      if (!parent) throw new NotFoundException('父文件夹不存在');
      parentPath = parent.path;
    }

    // 同级不重名（DB 有唯一约束，但这里先做一次友好校验）
    const exists = await this.folderRepo.findOne({ where: { userId, parentId, name } });
    if (exists) throw new BadRequestException('同级已存在同名文件夹');

    const folder = this.folderRepo.create({
      userId,
      parentId,
      name,
      path: this.joinPath(parentPath, name),
      sortOrder: 0,
    });

    try {
      return await this.folderRepo.save(folder);
    } catch (e: any) {
      // 兜底处理并发重复创建导致的唯一约束冲突
      if (String(e?.code) === 'ER_DUP_ENTRY') {
        throw new BadRequestException('同级已存在同名文件夹');
      }
      throw new InternalServerErrorException('创建文件夹失败');
    }
  }

  async renameFolder(userId: number, id: number, body: KbFolderRenameDto) {
    if (!id || id === 0) throw new BadRequestException('非法文件夹ID');
    const name = this.normalizeFolderName(body?.name);

    const folder = await this.folderRepo.findOne({ where: { id, userId } });
    if (!folder) throw new NotFoundException('文件夹不存在');

    // 同级不重名
    const sibling = await this.folderRepo.findOne({ where: { userId, parentId: folder.parentId, name } });
    if (sibling && sibling.id !== folder.id) throw new BadRequestException('同级已存在同名文件夹');

    // 计算新 path
    let parentPath = '';
    if (folder.parentId && folder.parentId !== 0) {
      const parent = await this.folderRepo.findOne({ where: { id: folder.parentId, userId } });
      if (!parent) throw new NotFoundException('父文件夹不存在');
      parentPath = parent.path;
    }

    const oldPath = folder.path;
    const newPath = this.joinPath(parentPath, name);

    folder.name = name;
    folder.path = newPath;

    try {
      await this.folderRepo.save(folder);

      // 同步更新所有后代的 path（只替换前缀）
      // e.g. /work -> /jobs, /work/ai -> /jobs/ai
      const prefix = `${oldPath}/`;
      await this.folderRepo
        .createQueryBuilder()
        .update(KbFolderEntity)
        .set({ path: () => `REPLACE(path, :oldPrefix, :newPrefix)` })
        .where('userId = :userId', { userId })
        .andWhere('path LIKE :like', { like: `${prefix}%` })
        .setParameters({ oldPrefix: prefix, newPrefix: `${newPath}/` })
        .execute();

      return folder;
    } catch (e: any) {
      if (String(e?.code) === 'ER_DUP_ENTRY') {
        throw new BadRequestException('同级已存在同名文件夹');
      }
      throw new InternalServerErrorException('重命名失败');
    }
  }

  async deleteFolder(userId: number, id: number) {
    if (!id || id === 0) throw new BadRequestException('非法文件夹ID');
    const folder = await this.folderRepo.findOne({ where: { id, userId } });
    if (!folder) throw new NotFoundException('文件夹不存在');

    const childFolderCount = await this.folderRepo.count({ where: { userId, parentId: id } });
    if (childFolderCount > 0) throw new BadRequestException('文件夹非空：存在子文件夹');

    // 仅允许删除空文件夹：无 kb_pdf（允许 status=3 的“已删除文件记录”存在与否，需要统一口径）
    // 这里按“无未删除文件”判断：status != 3 才算占用
    const childFileCount = await this.pdfRepo
      .createQueryBuilder('pdf')
      .where('pdf.userId = :userId', { userId })
      .andWhere('pdf.folderId = :folderId', { folderId: id })
      .andWhere('pdf.status != :deleted', { deleted: 3 })
      .getCount();

    if (childFileCount > 0) throw new BadRequestException('文件夹非空：存在文件');

    await this.folderRepo.delete({ id, userId });
    return { success: true };
  }

  async getFiles(
    userId: number,
    folderId: number,
    page: number,
    size: number,
  ): Promise<KbFileListResponseDto> {
    const safeFolderId = Number.isFinite(folderId) ? Math.max(0, Math.floor(folderId)) : 0;
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeSizeRaw = Number.isFinite(size) ? Math.floor(size) : 20;
    const safeSize = Math.min(Math.max(safeSizeRaw, 1), 100);

    const qb = this.pdfRepo
      .createQueryBuilder('pdf')
      .where('pdf.userId = :userId', { userId })
      .andWhere('pdf.folderId = :folderId', { folderId: safeFolderId })
      .andWhere('pdf.status != :deleted', { deleted: 3 })
      .orderBy('pdf.createdAt', 'DESC')
      .skip((safePage - 1) * safeSize)
      .take(safeSize);

    const [rows, count] = await qb.getManyAndCount();

    return {
      rows: rows.map((r) => ({
        id: r.id,
        folderId: r.folderId,
        displayName: r.displayName,
        originalName: r.originalName,
        sizeBytes: this.toNumber(r.sizeBytes, 0),
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      })),
      count,
    };
  }
}
