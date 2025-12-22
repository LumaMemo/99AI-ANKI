import { Controller, Get, UseGuards } from '@nestjs/common';
import { NoteGenService } from './noteGen.service';
import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';

@Controller('admin/note-gen')
@UseGuards(AdminAuthGuard)
export class AdminNoteGenController {
  constructor(private readonly noteGenService: NoteGenService) {}

  @Get('health')
  async health() {
    return this.noteGenService.health();
  }
}
