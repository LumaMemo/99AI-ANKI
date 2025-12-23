import { IsNotEmpty, IsNumber, IsObject, IsOptional } from 'class-validator';

export class CreateNoteGenJobDto {
  @IsNotEmpty({ message: 'kbPdfId 不能为空' })
  @IsNumber({}, { message: 'kbPdfId 必须是数字' })
  kbPdfId: number;

  @IsNotEmpty({ message: 'pageRange 不能为空' })
  @IsObject({ message: 'pageRange 必须是对象' })
  pageRange: { mode: 'all' };

  @IsOptional()
  @IsNumber({}, { message: 'configSnapshotId 必须是数字' })
  configSnapshotId?: number;
}
