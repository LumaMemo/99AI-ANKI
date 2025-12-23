import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'note_gen_job_step_usage' })
@Index('uniq_note_gen_step_usage_job_step', ['jobId', 'stepNumber'], { unique: true })
@Index('idx_note_gen_step_usage_job', ['jobId'])
@Index('idx_note_gen_step_usage_step_model', ['stepNumber', 'modelName', 'endedAt'])
export class NoteGenJobStepUsageEntity extends BaseEntity {
  @Column({ comment: '关联 note_gen_job.jobId（UUID）', length: 36 })
  jobId: string;

  @Column({ comment: '步骤号（覆盖 1..N，包括 9/10/11）', type: 'int' })
  stepNumber: number;

  @Column({ comment: '步骤状态（success/failed/skipped）', length: 16 })
  status: string;

  @Column({ comment: '步骤开始时间', type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ comment: '步骤结束时间', type: 'datetime', nullable: true })
  endedAt: Date;

  // model & usage
  @Column({ comment: '模型名称（对齐 admin 模型配置）', length: 128, default: '' })
  modelName: string;

  @Column({ comment: '供应商标识（openai/gemini/...）', length: 32, default: '' })
  provider: string;

  @Column({ comment: 'Prompt Tokens', type: 'int', default: 0 })
  promptTokens: number;

  @Column({ comment: 'Completion Tokens', type: 'int', default: 0 })
  completionTokens: number;

  @Column({ comment: 'Total Tokens', type: 'int', default: 0 })
  totalTokens: number;

  @Column({ comment: '上游成本', type: 'decimal', precision: 10, scale: 6, default: 0 })
  providerCost: number;

  // charging (written by service, not worker)
  @Column({ comment: '扣费状态（not_charged/charged）', length: 16, default: 'not_charged' })
  chargeStatus: string;

  @Column({ comment: '该 step 已扣点数', type: 'int', default: 0 })
  chargedPoints: number;

  @Column({ comment: '扣费时间', type: 'datetime', nullable: true })
  chargedAt: Date;

  // error
  @Column({ comment: '错误码', length: 64, default: '' })
  errorCode: string;

  @Column({ comment: '错误信息', length: 1024, default: '' })
  errorMessage: string;
}
