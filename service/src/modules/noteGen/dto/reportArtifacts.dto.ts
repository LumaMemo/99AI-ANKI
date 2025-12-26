import { IsString, IsArray, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReportArtifactDto {
  @ApiProperty({ description: '产物类型', example: 'markdown' })
  @IsString()
  type: string;

  @ApiProperty({ description: '文件名', example: 'notes.md' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '文件大小（字节）', example: 1024 })
  @IsNumber()
  sizeBytes: number;

  @ApiProperty({ description: 'COS 路径', example: 'kb/1/_note_gen/job1/notes.md' })
  @IsString()
  cosKey: string;

  @ApiProperty({ description: 'COS 桶', required: false })
  @IsOptional()
  @IsString()
  cosBucket?: string;

  @ApiProperty({ description: 'COS 地域', required: false })
  @IsOptional()
  @IsString()
  cosRegion?: string;
}

export class ReportArtifactsDto {
  @ApiProperty({ description: '任务 ID' })
  @IsString()
  jobId: string;

  @ApiProperty({ description: '产物列表', type: [ReportArtifactDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportArtifactDto)
  artifacts: ReportArtifactDto[];
}
