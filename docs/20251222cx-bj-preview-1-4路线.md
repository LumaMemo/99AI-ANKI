# 20251222cx-bj-preview（1-4 章）详细开发路线（可增量落地）

> 基于：[99AI-ANKI/docs/20251221cx-bj-preview.md](20251221cx-bj-preview.md)
>
> 本路线只覆盖第 1~4 章（范围/约束/领域模型&状态机/数据库设计）。
> 不包含第 5 章 API、第 6 章 Worker、第 7+ 章 UI/计费/清理等实现，但会为后续扩展预留结构。

---

## 0. 前置约定（用于所有 Step）

- 后端项目：99AI-ANKI/service（NestJS + TypeORM + MySQL）
- 本仓库数据库建表方式：启动时执行 [service/src/modules/database/initDatabase.ts](../service/src/modules/database/initDatabase.ts)（先做少量手工迁移，再用 `synchronize: true` 做结构同步）。
- **本路线每个 Step 都要求“能单独运行”**：至少 `pnpm -C 99AI-ANKI/service build:test` 通过；涉及建表的 Step 还要能在本地/测试库验证表结构存在。

### 0.1 环境变量（最小）

需要可启动 service，并连上 MySQL：

- `DB_HOST` `DB_PORT` `DB_USER` `DB_PASS` `DB_DATABASE`

（其他 Redis/JWT 等可以沿用现有 .env；本路线聚焦 DB 层。）

### 0.2 验证命令约定

- 代码编译验证（每步必做）：
  - `pnpm -C 99AI-ANKI/service build:test`
- 运行服务触发建表（仅“建表步骤”需要）：
  - `pnpm -C 99AI-ANKI/service dev`
- 数据库结构验证（示例用 MySQL CLI；如你用 Navicat/Workbench 也可以）：
  - `mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p<DB_PASS> <DB_DATABASE> -e "SHOW TABLES LIKE 'note_gen_%';"`

> Windows PowerShell 里执行时注意引号转义；如果不方便，可把 SQL 复制到客户端执行。

---

## Step 1：新增 note-gen 模块“空骨架”（不触发建表）

**目标**
- 先把目录与模块挂好，确保后续实体/枚举/DTO 能稳定落点。

**修改代码**
- 新增目录（先空实现，避免改动面过大）：
  - `99AI-ANKI/service/src/modules/noteGen/`
- 新增文件：
  - `99AI-ANKI/service/src/modules/noteGen/noteGen.module.ts`（先不 import TypeOrmModule.forFeature；也不注册到 AppModule）
  - `99AI-ANKI/service/src/modules/noteGen/types.ts`（预留 enums/type 定义占位）

**验证脚本**
- `pnpm -C 99AI-ANKI/service build:test`

**回滚策略**
- 直接删除新增的 `noteGen` 目录即可（无数据库影响）。

---

## Step 2：落地第 3 章“领域枚举/状态机”类型定义（不触发建表）

**目标**
- 将第 3 章的状态机与核心术语用 TypeScript 类型固化，为第 4 章实体字段与后续 API/Worker 对齐提供唯一来源。

**修改代码**
- 修改/完善：
  - `99AI-ANKI/service/src/modules/noteGen/types.ts`

建议在该文件定义（与预览文档对齐）：
- `NoteGenPipelineKey = 'generate-notes' | 'generate-anki' | 'reset-pages' | 'custom'`
- `NoteGenJobStatus = 'created' | 'processing' | 'completed' | 'incomplete' | 'failed'`
- `NoteGenChargeStatus = 'not_charged' | 'charging' | 'charged' | 'partial'`
- `NoteGenArtifactType = 'markdown-markmap' | 'word'`
- `NoteGenArtifactStatus = 'ready' | 'uploading' | 'failed'`
- `NoteGenStepStatus = 'success' | 'failed' | 'skipped'`

**验证脚本**
- `pnpm -C 99AI-ANKI/service build:test`

**回滚策略**
- 回退该文件改动即可（无数据库影响）。

---

## Step 3：新增表 note_gen_config 的 Entity（触发建表：1/4）

**目标**
- 实现第 4.1 章：`note_gen_config` 表结构，支持 admin 配置版本化（本期只落库，不实现 admin API）。

**修改代码**
- 新增 Entity：
  - `99AI-ANKI/service/src/modules/noteGen/noteGenConfig.entity.ts`
- 注册 Entity 到 TypeORM 显式 entity 列表（否则不会被同步建表）：
  - 修改 [99AI-ANKI/service/src/modules/database/database.module.ts](../service/src/modules/database/database.module.ts)
  - 修改 [99AI-ANKI/service/src/modules/database/initDatabase.ts](../service/src/modules/database/initDatabase.ts)

**表结构要点（与预览文档对齐）**
- 表名：`note_gen_config`
- 字段：`enabled` `version` `name` `configSchemaVersion` `configJson(json)` `updatedByAdminId` `remark` + BaseEntity
- 索引：
  - `idx_note_gen_config_enabled(enabled)`
  - `idx_note_gen_config_updatedAt(updatedAt)`

**验证脚本**
1) 编译：
- `pnpm -C 99AI-ANKI/service build:test`

2) 启动服务触发建表（确保 `.env` DB 可用）：
- `pnpm -C 99AI-ANKI/service dev`

3) 一行 SQL 验证表/索引：
- `mysql -h 127.0.0.1 -P 3306 -u root -p 2323 chatanki -e "SHOW TABLES LIKE 'note_gen_config'; SHOW INDEX FROM note_gen_config;"`

**回滚策略（关键）**
- 快速回滚代码：撤销新增 Entity，并从 `database.module.ts` 与 `initDatabase.ts` 的 entities 数组中移除。
- 快速回滚数据库（仅影响新表）：
  - `mysql ... -e "DROP TABLE IF EXISTS note_gen_config;"`

---

## Step 4：新增表 note_gen_job 的 Entity（触发建表：2/4）

**目标**
- 实现第 4.2 章：`note_gen_job` 主表结构（本期只落库，后续 API/Worker/计费都依赖它）。

**修改代码**
- 新增 Entity：
  - `99AI-ANKI/service/src/modules/noteGen/noteGenJob.entity.ts`
- 注册到：
  - [99AI-ANKI/service/src/modules/database/database.module.ts](../service/src/modules/database/database.module.ts)
  - [99AI-ANKI/service/src/modules/database/initDatabase.ts](../service/src/modules/database/initDatabase.ts)

**表结构要点（与预览文档对齐）**
- 表名：`note_gen_job`
- 关键字段：
  - 业务：`jobId(varchar36, uniq)` `userId` `kbPdfId`
  - 流水线：`pipelineKey` `stepsJson(json)` `pageRangeJson(json)` `requestJson(json)`
  - PDF 快照：`pdfCosBucket` `pdfCosRegion` `pdfCosKey` `pdfEtag` `pdfSizeBytes(bigint)` `pageCount`
  - 状态：`status` `progressPercent` `startedAt` `completedAt`
  - 配置快照：`configId` `configVersion` `configSnapshotJson(json)`
  - 计费：`estimatedCostMinPoints` `estimatedCostMaxPoints` `chargedPoints` `chargeStatus` `deductType`
  - 幂等：`idempotencyKey`（建议长度 64，存 sha256 hex）
  - 存储：`resultCosPrefix` `cosUploadStatus` `cosUploadedAt` `cleanupAt`
  - 错误：`lastErrorCode` `lastErrorMessage(1024)` `lastErrorAt` `lastErrorStack(text)`

- 约束/索引：
  - `uniq_note_gen_job_jobId(jobId)`
  - `uniq_note_gen_job_user_idempotency(userId, idempotencyKey)`
  - `idx_note_gen_job_user_status_updated(userId, status, updatedAt)`
  - `idx_note_gen_job_kbpdf_status(kbPdfId, status)`
  - `idx_note_gen_job_cleanup(status, cleanupAt)`

**验证脚本**
1) 编译：
- `pnpm -C 99AI-ANKI/service build:test`

2) 启动服务触发建表/加字段：
- `pnpm -C 99AI-ANKI/service dev`

3) 一行 SQL 验证（表 + 关键唯一索引）：
- `mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p<DB_PASS> <DB_DATABASE> -e "SHOW TABLES LIKE 'note_gen_job'; SHOW INDEX FROM note_gen_job;"`

**回滚策略（关键）**
- 代码回滚：移除 `noteGenJob.entity.ts` 并从 entities 数组删掉。
- DB 回滚：
  - `mysql ... -e "DROP TABLE IF EXISTS note_gen_job;"`

> 注意：如果后续 Step 已建立外键/逻辑依赖（目前设计里不强制 FK），回滚应从“子表→主表”顺序删除。

---

## Step 5：新增表 note_gen_job_step_usage 的 Entity（触发建表：3/4）

**目标**
- 实现第 4.3 章：记录每个 step 的用量与结算状态（为后续计费/统计/断点续跑提供事实来源）。

**修改代码**
- 新增 Entity：
  - `99AI-ANKI/service/src/modules/noteGen/noteGenJobStepUsage.entity.ts`
- 注册到：
  - [99AI-ANKI/service/src/modules/database/database.module.ts](../service/src/modules/database/database.module.ts)
  - [99AI-ANKI/service/src/modules/database/initDatabase.ts](../service/src/modules/database/initDatabase.ts)

**表结构要点（与预览文档对齐）**
- 表名：`note_gen_job_step_usage`
- 唯一约束：`uniq_note_gen_step_usage_job_step(jobId, stepNumber)`
- 索引：
  - `idx_note_gen_step_usage_job(jobId)`
  - `idx_note_gen_step_usage_step_model(stepNumber, modelName, endedAt)`

**验证脚本**
- `pnpm -C 99AI-ANKI/service build:test`
- `pnpm -C 99AI-ANKI/service dev`
- `mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p<DB_PASS> <DB_DATABASE> -e "SHOW TABLES LIKE 'note_gen_job_step_usage'; SHOW INDEX FROM note_gen_job_step_usage;"`

**回滚策略（关键）**
- 代码回滚：移除 entity + 从 entities 数组删掉。
- DB 回滚：
  - `mysql ... -e "DROP TABLE IF EXISTS note_gen_job_step_usage;"`

---

## Step 6：新增表 note_gen_job_artifact 的 Entity（触发建表：4/4）

**目标**
- 实现第 4.4 章：产物表，后续 Chat 下载列表与 Worker 续跑都依赖“产物存在性”。

**修改代码**
- 新增 Entity：
  - `99AI-ANKI/service/src/modules/noteGen/noteGenJobArtifact.entity.ts`
- 注册到：
  - [99AI-ANKI/service/src/modules/database/database.module.ts](../service/src/modules/database/database.module.ts)
  - [99AI-ANKI/service/src/modules/database/initDatabase.ts](../service/src/modules/database/initDatabase.ts)

**表结构要点（与预览文档对齐）**
- 表名：`note_gen_job_artifact`
- 唯一约束：`uniq_note_gen_artifact_job_type(jobId, type)`
- 索引：`idx_note_gen_artifact_job(jobId)`
- COS 字段：`cosBucket` `cosRegion` `cosKey(varchar1024)` `sizeBytes(bigint)` `etag`

**验证脚本**
- `pnpm -C 99AI-ANKI/service build:test`
- `pnpm -C 99AI-ANKI/service dev`
- `mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p<DB_PASS> <DB_DATABASE> -e "SHOW TABLES LIKE 'note_gen_job_artifact'; SHOW INDEX FROM note_gen_job_artifact;"`

**回滚策略（关键）**
- 代码回滚：移除 entity + 从 entities 数组删掉。
- DB 回滚：
  - `mysql ... -e "DROP TABLE IF EXISTS note_gen_job_artifact;"`

---

## Step 7：为第 4 章补齐“结构一致性自检”脚本（不改业务逻辑）

**目标**
- 避免后续进入第 5/6 章时才发现字段/索引缺失；提供一个最小可执行的 DB 自检脚本。

**修改代码**
- 新增脚本（Node/TS 或纯 SQL 都可，推荐纯 SQL 文档 + 可复制执行）：
  - `99AI-ANKI/service/src/modules/noteGen/sql/check_note_gen_schema.sql`

脚本内容建议包含：
- `SHOW TABLES LIKE 'note_gen_%';`
- `SHOW COLUMNS FROM note_gen_job;`（以及其它 3 表）
- `SHOW INDEX FROM ...;`

**验证脚本**
- `pnpm -C 99AI-ANKI/service build:test`
- `mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p<DB_PASS> <DB_DATABASE> < 99AI-ANKI/service/src/modules/noteGen/sql/check_note_gen_schema.sql`

**回滚策略**
- 删除该 SQL 文件即可（无数据库影响）。

---

## Step 8：补充 docs（把“第 1-4 章落地状态”固定成团队共识）

**目标**
- 让团队明确：第 1-4 章已落库 + 现阶段仅有 schema，不包含 API/Worker。

**修改代码**
- 修改/新增文档：
  - `99AI-ANKI/docs/20251222cx-bj-preview-1-4路线.md`（本文件）
  - （可选）在 `99AI-ANKI/docs/20251221cx-bj.md` 或 `README` 加一行“schema 已落地”的链接

**验证脚本**
- 无需运行服务；只需确保文档链接路径正确。

**回滚策略**
- 回退文档提交即可。

---

## 1-4 章完成后的“可交付物清单”（验收口径）

当 Step 1~8 做完后，视为第 1~4 章落地完成：

- `service/src/modules/noteGen/` 下存在：
  - `types.ts`（所有枚举）
  - 4 个 Entity 文件（config/job/step_usage/artifact）
- [service/src/modules/database/database.module.ts](../service/src/modules/database/database.module.ts) 与 [service/src/modules/database/initDatabase.ts](../service/src/modules/database/initDatabase.ts) 的 entities 数组包含上述 4 个新实体
- MySQL 内存在 4 张表：
  - `note_gen_config`
  - `note_gen_job`
  - `note_gen_job_step_usage`
  - `note_gen_job_artifact`
- 每张表的唯一约束与索引可通过 `SHOW INDEX` 验证存在

---

## 风险提示（与回滚相关）

- 本项目当前用 `synchronize: true` 做建表/改表，适合增量开发，但**不适合复杂的生产回滚**。
- 因此本路线把“关键 DB 变更”都做成“新增表”为主，并提供 `DROP TABLE` 的快速回滚；后续第 5/6 章若涉及列变更，请优先“新增列 + 兼容读写”策略，避免破坏性修改。
