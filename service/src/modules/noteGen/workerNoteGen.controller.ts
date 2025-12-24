import { Controller, Post, Body, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger';
import { NoteGenService } from './noteGen.service';
import { ReportArtifactsDto } from './dto/reportArtifacts.dto';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';

@ApiTags('Worker 接口')
@Controller('worker/note-gen')
export class WorkerNoteGenController {
  private readonly logger = new Logger(WorkerNoteGenController.name);

  constructor(
    private readonly noteGenService: NoteGenService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  @Post('report-artifacts')
  @ApiOperation({ summary: 'Worker 上报产物元数据并更新配额' })
  @ApiHeader({ name: 'X-Worker-Token', description: 'Worker 认证 Token' })
  async reportArtifacts(
    @Body() dto: ReportArtifactsDto,
    @Headers('x-worker-token') token: string,
  ) {
    const workerToken = await this.globalConfigService.getConfigs(['noteGenWorkerToken']);
    
    // 简单校验 Token
    if (!token || token !== workerToken) {
      this.logger.warn(`Unauthorized artifact report attempt with token: ${token}`);
      throw new UnauthorizedException('Invalid worker token');
    }

    return this.noteGenService.reportArtifacts(dto);
  }
}
