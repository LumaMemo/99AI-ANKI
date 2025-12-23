import { IsOptional, IsString } from 'class-validator';

export class AdminQueryNoteGenJobsDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  size?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  userId?: number;

  @IsOptional()
  kbPdfId?: number;

  @IsOptional()
  @IsString()
  jobId?: string;
}
