import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NoteGenConfigEntity } from './noteGenConfig.entity';
import { NoteGenJobEntity } from './noteGenJob.entity';
import { NoteGenJobArtifactEntity } from './noteGenJobArtifact.entity';
import { NoteGenJobStepUsageEntity } from './noteGenJobStepUsage.entity';
import { AdminUpdateNoteGenConfigDto } from './dto/adminUpdateNoteGenConfig.dto';

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

  async createJob() {
    return { message: 'Not implemented' };
  }

  async getJobDetail() {
    return { message: 'Not implemented' };
  }

  async adminListJobs() {
    return { message: 'Not implemented' };
  }
}
