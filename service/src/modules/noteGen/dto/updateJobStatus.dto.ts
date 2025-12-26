import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateJobStatusDto {
  @ApiProperty({ description: '任务 ID' })
  @IsString()
  jobId: string;

  @ApiProperty({ description: '任务状态', enum: ['processing', 'completed', 'incomplete', 'failed'] })
  @IsEnum(['processing', 'completed', 'incomplete', 'failed'])
  status: string;

  @ApiProperty({ description: '进度百分比', required: false })
  @IsOptional()
  @IsNumber()
  progressPercent?: number;

  @ApiProperty({ description: '错误码', required: false })
  @IsOptional()
  @IsString()
  lastErrorCode?: string;

  @ApiProperty({ description: '错误信息', required: false })
  @IsOptional()
  @IsString()
  lastErrorMessage?: string;
}
