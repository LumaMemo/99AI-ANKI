import { Controller, Get, Post, UseGuards, Param } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { NoteGenService } from './noteGen.service';

@Controller('note-gen')
@UseGuards(JwtAuthGuard)
export class NoteGenController {
  constructor(private readonly noteGenService: NoteGenService) {}

  @Post('jobs')
  async createJob() {
    return this.noteGenService.createJob();
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
