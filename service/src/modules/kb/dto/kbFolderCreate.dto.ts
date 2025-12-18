import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class KbFolderCreateDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  parentId?: number;

  @IsString()
  @MaxLength(255)
  name: string;
}
