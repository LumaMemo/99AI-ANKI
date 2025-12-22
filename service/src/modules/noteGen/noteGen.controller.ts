import { Controller, Get, Post, UseGuards, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { NoteGenService } from './noteGen.service';
import { CreateNoteGenJobDto } from './dto/createNoteGenJob.dto';

@Controller('note-gen')
@UseGuards(JwtAuthGuard)
export class NoteGenController {
  constructor(private readonly noteGenService: NoteGenService) {}

  @Post('jobs')
  async createJob(@Body() dto: CreateNoteGenJobDto, @Req() req: Request) {
    return this.noteGenService.createJob(dto, (req.user as any).id);
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
