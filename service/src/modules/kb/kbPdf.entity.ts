import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'kb_pdf' })
@Index('idx_kb_pdf_user_folder_created', ['userId', 'folderId', 'createdAt'])
@Index('idx_kb_pdf_user_status', ['userId', 'status'])
export class KbPdfEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '文件夹ID（根为0）', default: 0 })
  folderId: number;

  @Column({ comment: '展示名称' })
  displayName: string;

  @Column({ comment: '原始文件名' })
  originalName: string;

  @Column({ comment: '扩展名', length: 16 })
  ext: string;

  @Column({ comment: 'MIME 类型', length: 64 })
  mimeType: string;

  @Column({ comment: '文件大小（字节）', type: 'bigint', default: 0 })
  sizeBytes: number;

  @Column({ comment: 'COS Bucket', length: 128 })
  cosBucket: string;

  @Column({ comment: 'COS Region', length: 64 })
  cosRegion: string;

  @Column({ comment: 'COS Key', length: 1024 })
  cosKey: string;

  @Column({ comment: 'COS ETag', length: 128, nullable: true })
  etag: string;

  @Column({ comment: '1=active,2=deleting,3=deleted', type: 'tinyint', default: 1 })
  status: number;
}
