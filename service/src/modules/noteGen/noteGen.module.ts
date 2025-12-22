import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoteGenConfigEntity } from './noteGenConfig.entity';
import { NoteGenJobEntity } from './noteGenJob.entity';
import { NoteGenJobArtifactEntity } from './noteGenJobArtifact.entity';
import { NoteGenJobStepUsageEntity } from './noteGenJobStepUsage.entity';
import { NoteGenService } from './noteGen.service';
import { NoteGenController } from './noteGen.controller';
import { AdminNoteGenController } from './adminNoteGen.controller';
import { KbPdfEntity } from '../kb/kbPdf.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NoteGenConfigEntity,
      NoteGenJobEntity,
      NoteGenJobArtifactEntity,
      NoteGenJobStepUsageEntity,
      KbPdfEntity,
    ]),
  ],
  providers: [NoteGenService],
  controllers: [NoteGenController, AdminNoteGenController],
  exports: [NoteGenService],
})
export class NoteGenModule {}
