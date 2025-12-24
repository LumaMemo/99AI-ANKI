import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertStepUsageDto {
  @ApiProperty({ description: '任务 ID' })
  @IsString()
  jobId: string;

  @ApiProperty({ description: '步骤号' })
  @IsNumber()
  stepNumber: number;

  @ApiProperty({ description: '步骤状态', enum: ['success', 'failed', 'skipped'] })
  @IsEnum(['success', 'failed', 'skipped'])
  status: string;

  @ApiProperty({ description: '模型名称' })
  @IsString()
  modelName: string;

  @ApiProperty({ description: 'Prompt Tokens' })
  @IsNumber()
  promptTokens: number;

  @ApiProperty({ description: 'Completion Tokens' })
  @IsNumber()
  completionTokens: number;

  @ApiProperty({ description: 'Total Tokens' })
  @IsNumber()
  totalTokens: number;

  @ApiProperty({ description: '上游成本', required: false })
  @IsOptional()
  @IsNumber()
  providerCost?: number;

  @ApiProperty({ description: '错误码', required: false })
  @IsOptional()
  @IsString()
  errorCode?: string;

  @ApiProperty({ description: '错误信息', required: false })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
