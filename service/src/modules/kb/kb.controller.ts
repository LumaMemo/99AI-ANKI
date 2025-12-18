import { Controller, Get } from '@nestjs/common';
import { UseGuards } from '@nestjs/common/decorators/core/use-guards.decorator';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { KbFileListResponseDto } from './dto/kbFileList.dto';
import { KbFolderTreeNodeDto } from './dto/kbFolderTree.dto';
import { KbQuotaResponseDto } from './dto/kbQuota.dto';

@UseGuards(JwtAuthGuard)
@Controller('kb')
export class KbController {
  @Get('quota')
  quota(): KbQuotaResponseDto {
    return {
      quotaBytes: 0,
      usedBytes: 0,
      remainingBytes: 0,
    };
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
