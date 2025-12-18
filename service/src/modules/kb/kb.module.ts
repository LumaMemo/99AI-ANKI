import { Module } from '@nestjs/common';

import { KbController } from './kb.controller';

@Module({
  controllers: [KbController],
})
export class KbModule {}
