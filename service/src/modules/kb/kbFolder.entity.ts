import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'kb_folder' })
@Index('idx_kb_folder_user_parent', ['userId', 'parentId'])
@Index('uk_kb_folder_user_parent_name', ['userId', 'parentId', 'name'], { unique: true })
export class KbFolderEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '父文件夹ID（根为0）', default: 0 })
  parentId: number;

  @Column({ comment: '文件夹名称' })
  name: string;

  @Column({ comment: '规范化路径', length: 1024 })
  path: string;

  @Column({ comment: '排序', default: 0 })
  sortOrder: number;
}
