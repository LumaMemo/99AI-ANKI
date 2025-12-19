import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { UseGuards } from '@nestjs/common/decorators/core/use-guards.decorator';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { KbFileListResponseDto } from './dto/kbFileList.dto';
import { KbFileRenameDto } from './dto/kbFileRename.dto';
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

  @Get('files/:id/signed-url')
  async signedUrl(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req?.user?.id);
    return this.kbService.getFileSignedUrl(userId, Number(id));
  }

  @Patch('files/:id')
  async renameFile(@Req() req: any, @Param('id') id: string, @Body() body: KbFileRenameDto) {
    const userId = Number(req?.user?.id);
    return this.kbService.renameFile(userId, Number(id), body);
  }

  @Delete('files/:id')
  async deleteFile(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req?.user?.id);
    return this.kbService.deleteFile(userId, Number(id));
  }

  @Post('files/:id/retry-delete')
  async retryDeleteFile(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req?.user?.id);
    return this.kbService.retryDeleteFile(userId, Number(id));
  }

  @Post('files/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // 这里设置的是“硬上限兜底”，实际单文件上限仍以 kbSinglePdfMaxBytes 配置为准（服务端二次校验）。
      limits: {
        fileSize: 500 * 1024 * 1024,
      },
    }),
  )
  async uploadPdf(@Req() req: any, @Query() query: any, @UploadedFile() file: any) {
    const userId = Number(req?.user?.id);
    const folderId = Number(query?.folderId ?? 0);
    return this.kbService.uploadPdfToCos(userId, folderId, file);
  }
}
