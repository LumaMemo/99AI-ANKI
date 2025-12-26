import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';

import { KbController } from './kb.controller';
import { KbService } from './kb.service';
import { KbFolderEntity } from './kbFolder.entity';
import { KbPdfEntity } from './kbPdf.entity';
import { KbUserUsageEntity } from './kbUserUsage.entity';
import { NoteGenModule } from '../noteGen/noteGen.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserBalanceEntity,
      CramiPackageEntity,
      KbUserUsageEntity,
      KbFolderEntity,
      KbPdfEntity,
    ]),
    forwardRef(() => NoteGenModule),
  ],
  controllers: [KbController],
  providers: [KbService],
  exports: [KbService],
})
export class KbModule {}
