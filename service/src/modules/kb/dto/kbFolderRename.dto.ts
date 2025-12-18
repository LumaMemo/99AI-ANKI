import { IsString, MaxLength } from 'class-validator';

export class KbFolderRenameDto {
  @IsString()
  @MaxLength(255)
  name: string;
}
