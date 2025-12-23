import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'note_gen_job' })
@Index('uniq_note_gen_job_jobId', ['jobId'], { unique: true })
@Index('uniq_note_gen_job_user_idempotency', ['userId', 'idempotencyKey'], { unique: true })
@Index('idx_note_gen_job_user_status_updated', ['userId', 'status', 'updatedAt'])
@Index('idx_note_gen_job_kbpdf_status', ['kbPdfId', 'status'])
@Index('idx_note_gen_job_cleanup', ['status', 'cleanupAt'])
export class NoteGenJobEntity extends BaseEntity {
  // business identifiers
  @Column({ comment: '对外任务 ID（UUID）', length: 36 })
  jobId: string;

  @Column({ comment: '发起用户 ID' })
  userId: number;

  @Column({ comment: '来源 PDF（kb_pdf.id）' })
  kbPdfId: number;

  // pipeline definition
  @Column({ comment: '流水线标识（generate-notes/generate-anki/reset-pages/custom）', length: 32 })
  pipelineKey: string;

  @Column({ comment: '步骤号数组（JSON，保留顺序）', type: 'json' })
  stepsJson: number[];

  @Column({ comment: '页范围参数（JSON）', type: 'json' })
  pageRangeJson: Record<string, any>;

  @Column({ comment: '本次请求快照（JSON）', type: 'json' })
  requestJson: Record<string, any>;

  // pdf snapshot (redundant from kb_pdf to ensure reproducibility)
  @Column({ comment: 'PDF COS Bucket', length: 128 })
  pdfCosBucket: string;

  @Column({ comment: 'PDF COS Region', length: 64 })
  pdfCosRegion: string;

  @Column({ comment: 'PDF COS Key', length: 1024 })
  pdfCosKey: string;

  @Column({ comment: 'PDF ETag', length: 128, nullable: true })
  pdfEtag: string;

  @Column({ comment: 'PDF 文件名', length: 255, default: '' })
  pdfFileName: string;

  @Column({ comment: 'PDF 文件大小（字节）', type: 'bigint', default: 0 })
  pdfSizeBytes: number;

  @Column({ comment: 'PDF 总页数', default: 0 })
  pageCount: number;

  // status & progress (for chat polling)
  @Column({
    comment: '任务状态（created/processing/completed/incomplete/failed）',
    length: 16,
    default: 'created',
  })
  status: string;

  @Column({ comment: '进度百分比（0-100）', default: 0 })
  progressPercent: number;

  @Column({ comment: '首次开始执行时间', type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ comment: '完成时间（completed 时写入）', type: 'datetime', nullable: true })
  completedAt: Date;

  // config snapshot (job semantics stability)
  @Column({ comment: '创建任务时使用的 note_gen_config.id', default: 0 })
  configId: number;

  @Column({ comment: '创建任务时的配置版本号', default: 0 })
  configVersion: number;

  @Column({ comment: '创建任务时固化的完整配置快照（JSON）', type: 'json' })
  configSnapshotJson: Record<string, any>;

  // charging
  @Column({ comment: '预计最小点数', default: 0 })
  estimatedCostMinPoints: number;

  @Column({ comment: '预计最大点数', default: 0 })
  estimatedCostMaxPoints: number;

  @Column({ comment: '该 job 已扣点数（聚合自 step_usage）', default: 0 })
  chargedPoints: number;

  @Column({
    comment: '扣费状态（not_charged/charging/charged/partial）',
    length: 16,
    default: 'not_charged',
  })
  chargeStatus: string;

  @Column({ comment: '扣费类型（对齐现有系统枚举）', type: 'int', default: 0 })
  deductType: number;

  // idempotency
  @Column({ comment: '幂等键（sha256 hex）', length: 64 })
  idempotencyKey: string;

  // storage & cleanup
  @Column({ comment: '该 job 产物的 COS 前缀目录', length: 1024, default: '' })
  resultCosPrefix: string;

  @Column({
    comment: 'COS 上传状态（not_started/uploading/done/failed）',
    length: 16,
    default: 'not_started',
  })
  cosUploadStatus: string;

  @Column({ comment: '上传完成时间', type: 'datetime', nullable: true })
  cosUploadedAt: Date;

  @Column({ comment: '计划清理时间（completed 时写入 now+7d）', type: 'datetime', nullable: true })
  cleanupAt: Date;

  // last error (for admin diagnostics)
  @Column({ comment: '最后错误码', length: 64, default: '' })
  lastErrorCode: string;

  @Column({ comment: '最后错误信息', length: 1024, default: '' })
  lastErrorMessage: string;

  @Column({ comment: '最后错误时间', type: 'datetime', nullable: true })
  lastErrorAt: Date;

  @Column({ comment: '最后错误堆栈', type: 'text', nullable: true })
  lastErrorStack: string;

  @Column({ comment: '总消耗 Tokens', type: 'int', default: 0 })
  totalTokens: number;

  @Column({ comment: '总上游成本', type: 'decimal', precision: 10, scale: 6, default: 0 })
  totalProviderCost: number;
}
