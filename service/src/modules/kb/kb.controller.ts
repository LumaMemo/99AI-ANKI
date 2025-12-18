import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common/decorators/core/use-guards.decorator';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { KbFileListResponseDto } from './dto/kbFileList.dto';
import { KbFolderCreateDto } from './dto/kbFolderCreate.dto';
import { KbFolderRenameDto } from './dto/kbFolderRename.dto';
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
  async foldersTree(@Req() req: any): Promise<KbFolderTreeNodeDto> {
    const userId = Number(req?.user?.id);
    return this.kbService.getFoldersTree(userId);
  }

  @Post('folders')
  async createFolder(@Req() req: any, @Body() body: KbFolderCreateDto) {
    const userId = Number(req?.user?.id);
    return this.kbService.createFolder(userId, body);
  }

  @Patch('folders/:id')
  async renameFolder(@Req() req: any, @Param('id') id: string, @Body() body: KbFolderRenameDto) {
    const userId = Number(req?.user?.id);
    return this.kbService.renameFolder(userId, Number(id), body);
  }

  @Delete('folders/:id')
  async deleteFolder(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req?.user?.id);
    return this.kbService.deleteFolder(userId, Number(id));
  }

  @Get('files')
  async files(@Req() req: any, @Query() query: any): Promise<KbFileListResponseDto> {
    const userId = Number(req?.user?.id);
    const folderId = Number(query?.folderId ?? 0);
    const page = Number(query?.page ?? 1);
    const size = Number(query?.size ?? 20);
    return this.kbService.getFiles(userId, folderId, page, size);
  }
}
