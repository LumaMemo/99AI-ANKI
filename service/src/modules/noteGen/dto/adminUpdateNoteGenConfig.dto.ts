import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class AdminUpdateNoteGenConfigDto {
  @IsNotEmpty({ message: '配置名称不能为空' })
  @IsString({ message: '配置名称必须是字符串' })
  name: string;

  @IsNotEmpty({ message: '变更说明不能为空' })
  @IsString({ message: '变更说明必须是字符串' })
  remark: string;

  @IsNotEmpty({ message: '配置内容不能为空' })
  @IsObject({ message: '配置内容必须是对象' })
  configJson: any;
}
