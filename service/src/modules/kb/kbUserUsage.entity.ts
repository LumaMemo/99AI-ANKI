import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'kb_user_usage' })
export class KbUserUsageEntity {
  @PrimaryColumn({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '已使用字节数', type: 'bigint', default: 0 })
  usedBytes: number;

  @UpdateDateColumn({
    type: 'datetime',
    length: 0,
    nullable: false,
    name: 'updatedAt',
    comment: '更新时间',
  })
  updatedAt: Date;
}
