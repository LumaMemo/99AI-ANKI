import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'note_gen_config' })
@Index('idx_note_gen_config_enabled', ['enabled'])
@Index('idx_note_gen_config_updatedAt', ['updatedAt'])
export class NoteGenConfigEntity extends BaseEntity {
  @Column({
    comment: '是否启用（业务层保证同一时间最多一条为 true）',
    type: 'tinyint',
    default: 0,
  })
  enabled: boolean;

  @Column({ comment: '配置版本号（每次修改 +1）', default: 1 })
  version: number;

  @Column({ comment: '配置显示名', length: 255 })
  name: string;

  @Column({ comment: '配置结构版本（schema version）', default: 1 })
  configSchemaVersion: number;

  @Column({ comment: '配置内容（JSON）', type: 'json' })
  configJson: Record<string, any>;

  @Column({ comment: '最后修改管理员 ID', default: 0 })
  updatedByAdminId: number;

  @Column({ comment: '变更说明', length: 255, default: '' })
  remark: string;
}
