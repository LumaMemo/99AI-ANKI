import { IsString, MaxLength } from 'class-validator';

export class KbFileRenameDto {
  @IsString()
  @MaxLength(255)
  displayName: string;
}
