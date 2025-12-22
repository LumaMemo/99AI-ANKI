import { Controller, Get } from '@nestjs/common';
import { NoteGenService } from './noteGen.service';

@Controller('note-gen')
export class NoteGenController {
  constructor(private readonly noteGenService: NoteGenService) {}

  @Get('health')
  async health() {
    // simple health check for module integration during development
    return this.noteGenService.health();
  }
}
