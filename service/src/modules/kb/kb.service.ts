import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as TENCENTCOS from 'cos-nodejs-sdk-v5';
import { extname } from 'path';
import { Repository } from 'typeorm';
import { removeSpecialCharacters } from '@/common/utils/removeSpecialCharacters';
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

  private assertPdfUploadFileOrThrow(file: any) {
    if (!file) throw new BadRequestException('未找到上传文件：请使用 multipart/form-data 的 file 字段');
    // multer 对 multipart header 的 filename 解析在不同客户端可能出现乱码：
    // 常见表现是 UTF-8 字节被当作 latin1 解码，导致中文变成“ã°ä¸…”这种。
    // 这里做一次 latin1 -> utf8 纠正；若本来就是 UTF-8，转换后结果不变或更接近原文。
    const originalNameRaw = this.toTrimmedString(file?.originalname);
    const originalName = originalNameRaw
      ? Buffer.from(originalNameRaw, 'latin1').toString('utf8').trim()
      : '';
    if (!originalName) throw new BadRequestException('文件名为空');

    const sizeBytes = this.toNumber(file?.size, 0);
    if (!sizeBytes || sizeBytes <= 0) throw new BadRequestException('文件为空或大小非法');

    const mimeType = this.toTrimmedString(file?.mimetype);
    const ext = extname(originalName || '').toLowerCase();
    if (ext !== '.pdf') throw new BadRequestException('仅允许上传 PDF（文件扩展名必须为 .pdf）');
    if (mimeType && mimeType !== 'application/pdf') {
      // 部分浏览器/系统可能给出 application/x-pdf，但这里按“仅允许 PDF”严格处理
      throw new BadRequestException('仅允许上传 PDF（MIME 类型必须为 application/pdf）');
    }

    const buffer: Buffer | undefined = file?.buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 5) {
      throw new BadRequestException('上传文件读取失败（buffer 为空）');
    }
    const magic = buffer.subarray(0, 5).toString('utf8');
    if (magic !== '%PDF-') throw new BadRequestException('仅允许上传 PDF（文件头校验失败）');

    return {
      originalName,
      sizeBytes,
      mimeType: mimeType || 'application/pdf',
      buffer,
    };
  }

  private normalizeCosPrefix(prefix: string): string {
    const p = (prefix ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return p || DEFAULT_KB_COS_PREFIX;
  }

  private normalizeFolderPathForCos(path: string): string {
    const normalized = (path ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return normalized || 'root';
  }

  private sanitizeFileNameForCos(originalName: string): string {
    // 1) 去掉路径分隔符/控制字符
    const safe = (originalName ?? '')
      .trim()
      .replace(/[\\/]+/g, '-')
      .replace(/[\u0000-\u001F]/g, '');

    // 2) 强制 .pdf 后缀（避免出现 .pdf.pdf 或无后缀）
    const lower = safe.toLowerCase();
    if (lower.endsWith('.pdf')) return safe;
    return `${safe}.pdf`;
  }

  private buildCosKey(params: {
    prefix: string;
    userId: number;
    folderPath: string;
    pdfDisplaySlug: string;
    fileId: number;
    originalFileName: string;
  }): string {
    const parts = [
      this.normalizeCosPrefix(params.prefix),
      String(params.userId),
      params.folderPath,
      params.pdfDisplaySlug,
      String(params.fileId),
      params.originalFileName,
    ].filter(Boolean);
    return parts.join('/');
  }

  async uploadPdfToCos(userId: number, folderId: number, file: any) {
    if (!userId) throw new BadRequestException('未登录');
    const safeFolderId = Number.isFinite(folderId) ? Math.max(0, Math.floor(folderId)) : 0;

    const cfg = await this.getKbCosConfigOrThrow();
    const { originalName, sizeBytes, mimeType, buffer } = this.assertPdfUploadFileOrThrow(file);

    // 单文件上限（以配置为准）
    if (sizeBytes > cfg.singlePdfMaxBytes) {
      throw new BadRequestException(`单文件大小超过上限：最大允许 ${cfg.singlePdfMaxBytes} 字节`);
    }

    // 配额校验
    const quota = await this.getQuota(userId);
    if (sizeBytes > quota.remainingBytes) {
      throw new BadRequestException('知识库空间不足：剩余配额不足以上传该文件');
    }

    // folderPath
    let folderPath = 'root';
    if (safeFolderId !== 0) {
      const folder = await this.folderRepo.findOne({ where: { id: safeFolderId, userId } });
      if (!folder) throw new NotFoundException('目标文件夹不存在');
      folderPath = this.normalizeFolderPathForCos(folder.path);
    }

    // displayName：默认取文件名去掉扩展名
    const displayName = originalName.replace(/\.pdf$/i, '').trim() || 'pdf';
    const pdfDisplaySlug = this.toPathSegment(displayName) || 'pdf';
    const originalFileName = this.sanitizeFileNameForCos(originalName);

    // 先落库拿到 fileId，用于生成 cosKey
    const pending = this.pdfRepo.create({
      userId,
      folderId: safeFolderId,
      displayName,
      originalName: originalFileName,
      ext: 'pdf',
      mimeType,
      sizeBytes,
      cosBucket: cfg.bucket,
      cosRegion: cfg.region,
      cosKey: '',
      etag: null,
      status: 1,
    });

    const saved = await this.pdfRepo.save(pending);

    const cosKey = this.buildCosKey({
      prefix: cfg.prefix,
      userId,
      folderPath,
      pdfDisplaySlug,
      fileId: saved.id,
      originalFileName,
    });

    const cos = new TENCENTCOS({
      SecretId: cfg.secretId,
      SecretKey: cfg.secretKey,
      FileParallelLimit: 10,
    });

    try {
      const putResult: any = await new Promise((resolve, reject) => {
        cos.putObject(
          {
            Bucket: removeSpecialCharacters(cfg.bucket),
            Region: removeSpecialCharacters(cfg.region),
            Key: cosKey,
            StorageClass: 'STANDARD',
            Body: buffer,
            ContentType: 'application/pdf',
          },
          (err, data) => {
            if (err) return reject(err);
            return resolve(data);
          },
        );
      });

      const etag = this.toTrimmedString(putResult?.ETag || putResult?.etag);

      saved.cosKey = cosKey;
      saved.etag = etag || null;
      await this.pdfRepo.save(saved);

      // usedBytes += sizeBytes（getQuota 已确保 usage 行存在）
      await this.usageRepo
        .createQueryBuilder()
        .update(KbUserUsageEntity)
        .set({ usedBytes: () => 'usedBytes + :delta' })
        .where('userId = :userId', { userId })
        .setParameters({ delta: sizeBytes })
        .execute();

      return {
        id: saved.id,
        folderId: saved.folderId,
        displayName: saved.displayName,
        originalName: saved.originalName,
        sizeBytes: this.toNumber(saved.sizeBytes, 0),
        createdAt: saved.createdAt ? new Date(saved.createdAt).toISOString() : '',
      };
    } catch (e: any) {
      // 失败兜底：删除占位记录（尽量不污染 DB）
      try {
        await this.pdfRepo.delete({ id: saved.id, userId });
      } catch {
        // ignore
      }
      throw new InternalServerErrorException(`上传到知识库 COS 失败：${e?.message || '未知错误'}`);
    }
  }

  async getFileSignedUrl(userId: number, fileId: number): Promise<{ url: string; expiresAt: number }> {
    if (!userId) throw new BadRequestException('未登录');
    const id = Number.isFinite(fileId) ? Math.floor(fileId) : 0;
    if (!id) throw new BadRequestException('非法文件ID');

    const cfg = await this.getKbCosConfigOrThrow();

    const record = await this.pdfRepo.findOne({ where: { id, userId } });
    if (!record || Number(record.status) === 3) throw new NotFoundException('文件不存在');

    if (!record.cosKey) throw new InternalServerErrorException('文件 COS Key 缺失');
    if (!record.cosBucket) throw new InternalServerErrorException('文件 COS Bucket 缺失');
    if (!record.cosRegion) throw new InternalServerErrorException('文件 COS Region 缺失');

    const expiresSeconds = cfg.signedUrlExpiresSeconds;
    const expiresAt = Math.floor(Date.now() / 1000) + expiresSeconds;

    const cos = new TENCENTCOS({
      SecretId: cfg.secretId,
      SecretKey: cfg.secretKey,
      FileParallelLimit: 10,
    });

    const url: string = await new Promise((resolve, reject) => {
      // Sign=true 返回签名 URL；Expires 单位秒。
      cos.getObjectUrl(
        {
          Bucket: removeSpecialCharacters(record.cosBucket),
          Region: removeSpecialCharacters(record.cosRegion),
          Key: record.cosKey,
          Sign: true,
          Expires: expiresSeconds,
        },
        (err, data) => {
          if (err) return reject(err);
          // SDK 返回可能是 string 或 { Url: string }
          if (typeof data === 'string') return resolve(data);
          const u = this.toTrimmedString((data as any)?.Url || (data as any)?.url);
          if (!u) return reject(new Error('COS 返回的签名 URL 为空'));
          return resolve(u);
        },
      );
    });

    return { url, expiresAt };
  }

  async deleteFile(userId: number, fileId: number): Promise<{ success: boolean }> {
    if (!userId) throw new BadRequestException('未登录');
    const id = Number.isFinite(fileId) ? Math.floor(fileId) : 0;
    if (!id) throw new BadRequestException('非法文件ID');

    // 删除强依赖 COS
    await this.getKbCosConfigOrThrow();

    const record = await this.pdfRepo.findOne({ where: { id, userId } });
    if (!record || Number(record.status) === 3) throw new NotFoundException('文件不存在');
    if (!record.cosKey) throw new InternalServerErrorException('文件 COS Key 缺失');
    if (!record.cosBucket) throw new InternalServerErrorException('文件 COS Bucket 缺失');
    if (!record.cosRegion) throw new InternalServerErrorException('文件 COS Region 缺失');

    const sizeBytes = this.toNumber(record.sizeBytes, 0);

    // 1) 标记 deleting
    record.status = 2;
    await this.pdfRepo.save(record);

    // 2) 删除 COS 对象
    const cfg = await this.getKbCosConfigOrThrow();
    const cos = new TENCENTCOS({
      SecretId: cfg.secretId,
      SecretKey: cfg.secretKey,
      FileParallelLimit: 10,
    });

    try {
      await new Promise((resolve, reject) => {
        cos.deleteObject(
          {
            Bucket: removeSpecialCharacters(record.cosBucket),
            Region: removeSpecialCharacters(record.cosRegion),
            Key: record.cosKey,
          },
          (err, data) => {
            if (err) return reject(err);
            return resolve(data);
          },
        );
      });
    } catch (e: any) {
      // 保持 deleting 状态，便于后续重试/人工修复
      throw new InternalServerErrorException(`删除 COS 对象失败：${e?.message || '未知错误'}`);
    }

    // 3) 标记 deleted
    record.status = 3;
    await this.pdfRepo.save(record);

    // 4) usedBytes -= sizeBytes（不低于 0）
    if (sizeBytes > 0) {
      await this.usageRepo
        .createQueryBuilder()
        .update(KbUserUsageEntity)
        .set({ usedBytes: () => 'GREATEST(usedBytes - :delta, 0)' })
        .where('userId = :userId', { userId })
        .setParameters({ delta: sizeBytes })
        .execute();
    }

    return { success: true };
  }

  async renameFile(userId: number, fileId: number, body: { displayName: string }) {
    if (!userId) throw new BadRequestException('未登录');
    const id = Number.isFinite(fileId) ? Math.floor(fileId) : 0;
    if (!id) throw new BadRequestException('非法文件ID');

    const displayName = this.toTrimmedString((body as any)?.displayName);
    if (!displayName) throw new BadRequestException('文件名不能为空');
    if (displayName.length > 255) throw new BadRequestException('文件名过长');

    const record = await this.pdfRepo.findOne({ where: { id, userId } });
    if (!record || Number(record.status) === 3) throw new NotFoundException('文件不存在');

    record.displayName = displayName;
    const saved = await this.pdfRepo.save(record);

    return {
      id: saved.id,
      folderId: saved.folderId,
      displayName: saved.displayName,
      originalName: saved.originalName,
      sizeBytes: this.toNumber(saved.sizeBytes, 0),
      createdAt: saved.createdAt ? new Date(saved.createdAt).toISOString() : '',
    };
  }
}
