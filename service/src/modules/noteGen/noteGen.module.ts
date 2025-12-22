import { Module } from '@nestjs/common';
import { NoteGenController } from './noteGen.controller';
import { AdminNoteGenController } from './adminNoteGen.controller';
import { NoteGenService } from './noteGen.service';

@Module({
  imports: [],
  controllers: [NoteGenController, AdminNoteGenController],
  providers: [NoteGenService],
  exports: [NoteGenService],
})
export class NoteGenModule {}
