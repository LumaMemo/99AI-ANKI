import { Controller, Get, Put, UseGuards, Param, Body, Req, Query } from '@nestjs/common';
import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { NoteGenService } from './noteGen.service';
import { AdminUpdateNoteGenConfigDto } from './dto/adminUpdateNoteGenConfig.dto';
import { AdminQueryNoteGenJobsDto } from './dto/adminQueryNoteGenJobs.dto';
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
  async listJobs(@Query() query: AdminQueryNoteGenJobsDto) {
    return this.noteGenService.adminListJobs(query);
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: '管理端获取任务详情' })
  async getJobDetail(@Param('jobId') jobId: string) {
    // 管理端查询不需要传 userId，isAdmin 传 true，且包含步骤用量
    return this.noteGenService.getJobDetail(jobId, undefined, true);
  }

  @Get('jobs/:jobId/files/:fileType/signed-url')
  @ApiOperation({ summary: '管理端获取产物签名下载 URL' })
  async getSignedUrl(@Param('jobId') jobId: string, @Param('fileType') fileType: string) {
    return this.noteGenService.getArtifactSignedUrl(jobId, fileType, undefined, true);
  }
}
