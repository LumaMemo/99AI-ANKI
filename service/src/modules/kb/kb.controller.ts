import { Controller, Get, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common/decorators/core/use-guards.decorator';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { KbFileListResponseDto } from './dto/kbFileList.dto';
import { KbFolderTreeNodeDto } from './dto/kbFolderTree.dto';
import { KbQuotaResponseDto } from './dto/kbQuota.dto';
import { KbService } from './kb.service';

@UseGuards(JwtAuthGuard)
@Controller('kb')
export class KbController {
  constructor(private readonly kbService: KbService) {}

  @Get('quota')
  async quota(@Req() req: any): Promise<KbQuotaResponseDto> {
    const userId = Number(req?.user?.id);
    return this.kbService.getQuota(userId);
  }

  @Get('folders/tree')
  foldersTree(): KbFolderTreeNodeDto {
    return {
      id: 0,
      name: '根目录',
      children: [],
    };
  }

  @Get('files')
  files(): KbFileListResponseDto {
    return {
      rows: [],
      count: 0,
    };
  }
}
