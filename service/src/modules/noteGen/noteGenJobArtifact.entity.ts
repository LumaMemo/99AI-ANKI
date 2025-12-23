import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'note_gen_job_artifact' })
@Index('uniq_note_gen_artifact_job_type', ['jobId', 'type'], { unique: true })
@Index('idx_note_gen_artifact_job', ['jobId'])
export class NoteGenJobArtifactEntity extends BaseEntity {
  @Column({ comment: '关联 note_gen_job.jobId（UUID）', length: 36 })
  jobId: string;

  @Column({ comment: '产物类型（markdown-markmap/word）', length: 32 })
  type: string;

  @Column({ comment: '产物状态（ready/uploading/failed）', length: 16, default: 'uploading' })
  status: string;

  @Column({ comment: '用户下载时展示名', length: 255, default: '' })
  fileName: string;

  @Column({ comment: 'MIME Content-Type', length: 128, default: '' })
  contentType: string;

  @Column({ comment: 'COS Bucket', length: 128, default: '' })
  cosBucket: string;

  @Column({ comment: 'COS Region', length: 64, default: '' })
  cosRegion: string;

  @Column({ comment: 'COS Key', length: 1024, default: '' })
  cosKey: string;

  @Column({ comment: '文件大小（字节）', type: 'bigint', default: 0 })
  sizeBytes: number;

  @Column({ comment: 'ETag', length: 128, default: '' })
  etag: string;
}
