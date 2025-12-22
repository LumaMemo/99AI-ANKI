import { Controller, Get, Put, UseGuards, Param, Body, Req } from '@nestjs/common';
import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { NoteGenService } from './noteGen.service';
import { AdminUpdateNoteGenConfigDto } from './dto/adminUpdateNoteGenConfig.dto';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('admin/note-gen')
@ApiBearerAuth()
@Controller('admin/note-gen')
@UseGuards(AdminAuthGuard)
export class AdminNoteGenController {
  constructor(private readonly noteGenService: NoteGenService) {}

  @Get('config')
  @ApiOperation({ summary: '获取当前启用的笔记生成配置' })
  async getConfig() {
    return this.noteGenService.getActiveConfig();
  }

  @Put('config')
  @ApiOperation({ summary: '更新笔记生成配置（版本化）' })
  async updateConfig(@Body() dto: AdminUpdateNoteGenConfigDto, @Req() req: Request) {
    return this.noteGenService.updateConfig(dto, req.user.id);
  }

  @Get('jobs')
  @ApiOperation({ summary: '管理端获取任务列表' })
  async listJobs() {
    return this.noteGenService.adminListJobs();
  }

  @Get('jobs/:jobId')
  async getJobDetail(@Param('jobId') jobId: string) {
    return this.noteGenService.getJobDetail();
  }

  @Get('jobs/:jobId/files/:fileType/signed-url')
  async getSignedUrl() {
    return { message: 'Not implemented' };
  }
}
