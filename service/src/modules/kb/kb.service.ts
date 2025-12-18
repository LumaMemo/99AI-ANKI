import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
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
