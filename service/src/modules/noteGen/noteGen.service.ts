import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as TENCENTCOS from 'cos-nodejs-sdk-v5';
import { removeSpecialCharacters } from '@/common/utils/removeSpecialCharacters';
import { NoteGenConfigEntity } from './noteGenConfig.entity';
import { NoteGenJobEntity } from './noteGenJob.entity';
import { NoteGenJobArtifactEntity } from './noteGenJobArtifact.entity';
import { NoteGenJobStepUsageEntity } from './noteGenJobStepUsage.entity';
import { AdminUpdateNoteGenConfigDto } from './dto/adminUpdateNoteGenConfig.dto';
import { CreateNoteGenJobDto } from './dto/createNoteGenJob.dto';
import { AdminQueryNoteGenJobsDto } from './dto/adminQueryNoteGenJobs.dto';
import { KbPdfEntity } from '../kb/kbPdf.entity';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';

@Injectable()
export class NoteGenService {
  private readonly logger = new Logger(NoteGenService.name);

  constructor(
    @InjectRepository(NoteGenConfigEntity)
    private readonly noteGenConfigRepo: Repository<NoteGenConfigEntity>,
    @InjectRepository(NoteGenJobEntity)
    private readonly noteGenJobRepo: Repository<NoteGenJobEntity>,
    @InjectRepository(NoteGenJobArtifactEntity)
    private readonly noteGenJobArtifactRepo: Repository<NoteGenJobArtifactEntity>,
    @InjectRepository(NoteGenJobStepUsageEntity)
    private readonly noteGenJobStepUsageRepo: Repository<NoteGenJobStepUsageEntity>,
    @InjectRepository(KbPdfEntity)
    private readonly kbPdfRepo: Repository<KbPdfEntity>,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /**
   * 获取当前启用的配置
   */
  async getActiveConfig() {
    const config = await this.noteGenConfigRepo.findOne({
      where: { enabled: true },
      order: { version: 'DESC' },
    });
    if (!config) {
      throw new NotFoundException('当前没有启用的笔记生成配置');
    }
    return config;
  }

  /**
   * 更新配置（版本化）
   */
  async updateConfig(dto: AdminUpdateNoteGenConfigDto, adminId: number) {
    // 1. 查找当前启用的配置
    const currentConfig = await this.noteGenConfigRepo.findOne({
      where: { enabled: true },
    });

    // 2. 如果存在旧配置，将其置为禁用
    if (currentConfig) {
      await this.noteGenConfigRepo.update(currentConfig.id, { enabled: false });
    }

    // 3. 创建新配置记录
    const newConfig = this.noteGenConfigRepo.create({
      ...dto,
      version: currentConfig ? currentConfig.version + 1 : 1,
      enabled: true,
      updatedByAdminId: adminId,
    });

    return await this.noteGenConfigRepo.save(newConfig);
  }

  /**
   * 创建生成笔记任务
   */
  async createJob(dto: CreateNoteGenJobDto, userId: number) {
    const { kbPdfId, pageRange, configSnapshotId } = dto;

    // 1. 校验 kbPdfId 是否属于当前用户
    const kbPdf = await this.kbPdfRepo.findOne({
      where: { id: kbPdfId, userId, status: 1 },
    });
    if (!kbPdf) {
      throw new NotFoundException('PDF 文件不存在或不属于该用户');
    }

    // 2. 获取配置
    let config: NoteGenConfigEntity;
    if (configSnapshotId) {
      config = await this.noteGenConfigRepo.findOne({ where: { id: configSnapshotId } });
      if (!config) throw new NotFoundException('指定的配置不存在');
    } else {
      config = await this.getActiveConfig();
    }

    // 3. 计算 idempotencyKey
    // userId + kbPdfId + pipelineKey + pageRangeJson + configId + configVersion + pdfEtag
    const pipelineKey = 'generate-notes';
    const pageRangeJson = JSON.stringify(pageRange);
    const rawKey = `${userId}-${kbPdfId}-${pipelineKey}-${pageRangeJson}-${config.id}-${config.version}-${kbPdf.etag || ''}`;
    const idempotencyKey = createHash('sha256').update(rawKey).digest('hex');

    // 4. 检查是否存在相同幂等键的 Job
    const existingJob = await this.noteGenJobRepo.findOne({
      where: { userId, idempotencyKey },
    });
    if (existingJob) {
      // 如果任务已存在但未完成，尝试再次触发 Worker（幂等触发）
      if (['created', 'failed', 'incomplete'].includes(existingJob.status)) {
        this.triggerWorker(existingJob).catch((err) => {
          this.logger.error(
            `Failed to re-trigger worker for existing job ${existingJob.jobId}: ${err.message}`,
          );
        });
      }
      return existingJob;
    }

    // 5. 创建新 Job
    const jobId = uuidv4();
    const newJob = this.noteGenJobRepo.create({
      jobId,
      userId,
      kbPdfId,
      pipelineKey,
      stepsJson: [1, 2, 3, 4, 5, 8],
      pageRangeJson: pageRange,
      requestJson: dto as any,
      // PDF snapshot
      pdfCosBucket: kbPdf.cosBucket,
      pdfCosRegion: kbPdf.cosRegion,
      pdfCosKey: kbPdf.cosKey,
      pdfEtag: kbPdf.etag,
      pdfSizeBytes: Number(kbPdf.sizeBytes),
      pageCount: 0, // 后续由 worker 更新
      // Config snapshot
      configId: config.id,
      configVersion: config.version,
      configSnapshotJson: config.configJson as any,
      // Status
      status: 'created',
      progressPercent: 0,
      // Idempotency
      idempotencyKey,
      // Charging
      estimatedCostMinPoints: 0,
      estimatedCostMaxPoints: 0,
      chargeStatus: 'not_charged',
    });

    const savedJob = await this.noteGenJobRepo.save(newJob);

    // 6. 异步触发 Worker
    this.triggerWorker(savedJob).catch((err) => {
      this.logger.error(`Failed to trigger worker for job ${jobId}: ${err.message}`, err.stack);
    });

    return savedJob;
  }

  /**
   * 触发 Python Worker 执行任务
   */
  private async triggerWorker(job: NoteGenJobEntity) {
    // 1. 获取 Worker URL
    const configs = await this.globalConfigService.getConfigs(['noteGenWorkerUrl']);
    const url = configs?.noteGenWorkerUrl || 'http://127.0.0.1:8000/run';

    this.logger.log(`Triggering worker for job ${job.jobId} at ${url}`);

    // 2. 构造请求体
    // 注意：Worker 需要 jobId 和 filePath (COS Key)
    const payload = {
      job_id: job.jobId,
      file_path: job.pdfCosKey,
    };

    // 3. 发送请求 (不等待执行完成，Worker 是异步的)
    try {
      const response = await axios.post(url, payload, {
        timeout: 5000, // 触发请求快进快出
      });
      this.logger.log(`Worker triggered successfully for job ${job.jobId}: ${JSON.stringify(response.data)}`);
    } catch (error) {
      const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      throw new Error(`Worker trigger failed: ${msg}`);
    }
  }

  /**
   * 查询任务详情（Chat 侧 / Admin 侧）
   */
  async getJobDetail(jobId: string, userId?: number, includeStepUsage = false) {
    // 1. 查询任务主表
    const where: any = { jobId };
    if (userId !== undefined) {
      where.userId = userId;
    }
    const job = await this.noteGenJobRepo.findOne({ where });

    if (!job) {
      throw new NotFoundException('任务不存在或不属于该用户');
    }

    // 2. 构造基础返回对象
    const result: any = {
      jobId: job.jobId,
      userId: job.userId,
      kbPdfId: job.kbPdfId,
      status: job.status,
      progressPercent: Number(job.progressPercent),
      estimatedCostPoints: {
        min: job.estimatedCostMinPoints,
        max: job.estimatedCostMaxPoints,
      },
      chargedPoints: job.chargedPoints,
      chargeStatus: job.chargeStatus,
      updatedAt: job.updatedAt,
      createdAt: job.createdAt,
    };

    // 3. 失败/未完成提示
    if (job.status === 'failed') {
      result.userMessage = '任务未完成（可续跑）：不会浪费点数，请稍后重试或稍后再次发起生成。';
    } else if (job.status === 'incomplete') {
      result.userMessage = '任务未完成（可续跑）：已生成部分结果，后续继续不会重复扣费。';
    }

    // 4. 结果文件列表（仅当 status=completed 时返回，或者管理员查询时返回）
    if (job.status === 'completed' || userId === undefined) {
      const artifacts = await this.noteGenJobArtifactRepo.find({
        where: { jobId, status: 'ready' },
      });
      result.resultFiles = artifacts.map((art) => ({
        type: art.type,
        status: art.status,
        fileName: art.fileName,
        sizeBytes: Number(art.sizeBytes),
        updatedAt: art.updatedAt,
      }));
    } else {
      result.resultFiles = [];
    }

    // 5. 步骤用量明细（仅管理端详情需要）
    if (includeStepUsage) {
      const stepUsages = await this.noteGenJobStepUsageRepo.find({
        where: { jobId },
        order: { stepNumber: 'ASC' },
      });
      result.stepUsages = stepUsages;
    }

    return result;
  }

  /**
   * 获取产物签名下载 URL
   */
  async getArtifactSignedUrl(jobId: string, fileType: string, userId?: number, isAdmin = false) {
    // 1. 查找 Job
    const job = await this.noteGenJobRepo.findOne({
      where: isAdmin ? { jobId } : { jobId, userId },
    });
    if (!job) {
      throw new NotFoundException('任务不存在或不属于该用户');
    }

    // 2. 校验状态
    if (job.status !== 'completed') {
      throw new BadRequestException('任务尚未完成，无法下载产物');
    }

    // 3. 查找产物
    const artifact = await this.noteGenJobArtifactRepo.findOne({
      where: { jobId, type: fileType },
    });
    if (!artifact) {
      throw new NotFoundException('产物不存在');
    }
    if (artifact.status !== 'ready') {
      throw new BadRequestException('产物尚未准备就绪');
    }

    // 4. 获取 COS 配置 (复用 KB 配置)
    const rawConfigs = await this.globalConfigService.getConfigs([
      'kbTencentCosStatus',
      'kbCosSecretId',
      'kbCosSecretKey',
      'kbCosBucket',
      'kbCosRegion',
      'kbCosSignedUrlExpiresSeconds',
    ]);

    const enabled = Number(rawConfigs.kbTencentCosStatus) === 1;
    if (!enabled) {
      throw new BadRequestException('知识库腾讯云 COS 未启用');
    }

    const secretId = rawConfigs.kbCosSecretId;
    const secretKey = rawConfigs.kbCosSecretKey;
    const expiresSeconds = Number(rawConfigs.kbCosSignedUrlExpiresSeconds) || 60;

    if (!secretId || !secretKey) {
      throw new BadRequestException('知识库腾讯云 COS 配置缺失');
    }

    // 5. 生成签名 URL
    const cos = new TENCENTCOS({
      SecretId: secretId,
      SecretKey: secretKey,
    });

    const expiresAt = Math.floor(Date.now() / 1000) + expiresSeconds;

    const url: string = await new Promise((resolve, reject) => {
      cos.getObjectUrl(
        {
          Bucket: removeSpecialCharacters(artifact.cosBucket),
          Region: removeSpecialCharacters(artifact.cosRegion),
          Key: artifact.cosKey,
          Sign: true,
          Expires: expiresSeconds,
        },
        (err, data) => {
          if (err) return reject(err);
          if (typeof data === 'string') return resolve(data);
          const u = (data as any)?.Url || (data as any)?.url;
          if (!u) return reject(new Error('COS 返回的签名 URL 为空'));
          return resolve(u);
        },
      );
    });

    return { url, expiresAt };
  }

  /**
   * 管理端获取任务列表
   */
  async adminListJobs(query: AdminQueryNoteGenJobsDto) {
    const { page = 1, size = 20, status, userId, kbPdfId, jobId } = query;

    const qb = this.noteGenJobRepo.createQueryBuilder('job');

    if (status) {
      qb.andWhere('job.status = :status', { status });
    }
    if (userId) {
      qb.andWhere('job.userId = :userId', { userId });
    }
    if (kbPdfId) {
      qb.andWhere('job.kbPdfId = :kbPdfId', { kbPdfId });
    }
    if (jobId) {
      qb.andWhere('job.jobId LIKE :jobId', { jobId: `%${jobId}%` });
    }

    qb.orderBy('job.id', 'DESC');
    qb.skip((page - 1) * size);
    qb.take(size);

    const [rows, count] = await qb.getManyAndCount();

    return {
      rows,
      count,
    };
  }
}
