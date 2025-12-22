import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { NoteGenConfigEntity } from './noteGenConfig.entity';
import { NoteGenJobEntity } from './noteGenJob.entity';
import { NoteGenJobArtifactEntity } from './noteGenJobArtifact.entity';
import { NoteGenJobStepUsageEntity } from './noteGenJobStepUsage.entity';
import { AdminUpdateNoteGenConfigDto } from './dto/adminUpdateNoteGenConfig.dto';
import { CreateNoteGenJobDto } from './dto/createNoteGenJob.dto';
import { KbPdfEntity } from '../kb/kbPdf.entity';

@Injectable()
export class NoteGenService {
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

    return await this.noteGenJobRepo.save(newJob);
  }

  async getJobDetail() {
    return { message: 'Not implemented' };
  }

  async adminListJobs() {
    return { message: 'Not implemented' };
  }
}
