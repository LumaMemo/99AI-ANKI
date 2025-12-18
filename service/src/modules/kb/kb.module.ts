import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';

import { KbController } from './kb.controller';
import { KbService } from './kb.service';
import { KbUserUsageEntity } from './kbUserUsage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserBalanceEntity, CramiPackageEntity, KbUserUsageEntity])],
  controllers: [KbController],
  providers: [KbService],
})
export class KbModule {}
