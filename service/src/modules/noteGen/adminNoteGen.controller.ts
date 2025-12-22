import { Controller, Get, Put, UseGuards, Param } from '@nestjs/common';
import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { NoteGenService } from './noteGen.service';

@Controller('admin/note-gen')
@UseGuards(AdminAuthGuard)
export class AdminNoteGenController {
  constructor(private readonly noteGenService: NoteGenService) {}

  @Get('config')
  async getConfig() {
    return this.noteGenService.getActiveConfig();
  }

  @Put('config')
  async updateConfig() {
    return this.noteGenService.updateConfig();
  }

  @Get('jobs')
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
