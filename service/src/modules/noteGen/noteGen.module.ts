import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoteGenConfigEntity } from './noteGenConfig.entity';
import { NoteGenJobEntity } from './noteGenJob.entity';
import { NoteGenJobArtifactEntity } from './noteGenJobArtifact.entity';
import { NoteGenJobStepUsageEntity } from './noteGenJobStepUsage.entity';
import { NoteGenService } from './noteGen.service';
import { NoteGenController } from './noteGen.controller';
import { AdminNoteGenController } from './adminNoteGen.controller';
import { WorkerNoteGenController } from './workerNoteGen.controller';
import { KbPdfEntity } from '../kb/kbPdf.entity';
import { ModelsEntity } from '../models/models.entity';
import { KbModule } from '../kb/kb.module';
import { forwardRef } from '@nestjs/common';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { UserBalanceModule } from '../userBalance/userBalance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NoteGenConfigEntity,
      NoteGenJobEntity,
      NoteGenJobArtifactEntity,
      NoteGenJobStepUsageEntity,
      KbPdfEntity,
      ModelsEntity,
    ]),
    forwardRef(() => KbModule),
    GlobalConfigModule,
    UserBalanceModule,
  ],
  providers: [NoteGenService],
  controllers: [NoteGenController, AdminNoteGenController, WorkerNoteGenController],
  exports: [NoteGenService],
})
export class NoteGenModule {}
