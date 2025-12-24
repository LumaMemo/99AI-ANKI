# 99AI-ANKI：PDF 生成笔记（功能 1）移植需求文档（Preview）

> 文档目的：把 `pdf_to_anki/src` 的“PDF → 知识点笔记（生成笔记）”能力移植到 `99AI-ANKI`。
>
> 重要范围约束：**本期只做功能 1：生成笔记（步骤 1,2,3,4,5,8）**。功能 2（生成 Anki 卡片）、功能 3（按页重置重建）本期不做，但本设计为后续扩展预留兼容。
>
> 运行环境约束：处理流水线（worker）统一按 **Python 3.11** 设计与部署。
>
> 编写顺序说明：本文档已按你后续写代码的顺序重排（先后端/数据/接口，再 worker/存储/计费，最后 admin/chat UI）。

---

## 1. 范围与非目标（先锁边界）

### 1.1 本期范围

- 仅实现“生成笔记（Generate Notes）”，对齐 `pdf_to_anki/src/api/README.md` 的端点 1
- 执行步骤：**1,2,3,4,5,8**
- 任务必须异步：耗时可能数分钟到数小时

### 1.2 明确非目标（本期不做）

- 功能 2：生成 Anki 卡片（步骤 1,2,3,4,5,6,7）
- 功能 3：按页重置并重建（步骤 9,3,4,5,8）
- 用户自定义页范围（本期固定“全页”不可修改）
- 任务中断/取消（需求明确：**不允许中断任务**）

---

## 2. 运行与部署约束（先定硬条件）

### 2.1 环境与依赖

- Python worker：**Python 3.11**
- 后端：现有 NestJS service（JWT 鉴权）
- 存储：腾讯云 COS（知识库已在用）

### 2.2 前端交互硬约束

- 进度展示：**6 段进度条，每段 16.6%**；用户只看到 0~100% 数字，**不暴露具体步骤含义**
- 轮询：手动刷新 + 默认 1 分钟自动刷新
- 允许用户退出页面/开新对话，不影响任务执行

### 2.3 现状对齐（来自现有代码库的事实）

- Chat Footer 已存在 pill 按钮：推理(usingDeepThinking)、搜索(usingNetwork)、图表(usingMermaid)
- 后端已有知识库 `kb` 模块，表 `kb_pdf` 存储 PDF 的 COS 信息，并支持签名 URL：`GET /kb/files/:id/signed-url`
- 后端已有 `@nestjs/schedule` 定时任务基础设施，可用于 7 天清理

---

## 3. 后端：领域模型与状态机（先把“要做什么”抽象清）

### 3.1 核心术语

- **KB / 知识库**：99AI-ANKI 的知识库模块（已有 `kb_pdf` 表）
- **生成笔记任务 / Job**：用户对某个 KB PDF 发起一次“生成笔记”的异步任务
- **断点续传**：同一 PDF 的流水线中间产物/最终产物存在时可复用，失败后重试不会浪费用户点数
- **普通点数**：99AI 计费用点数，扣费规则需与 admin 里“模型名称 → 扣费策略”保持一致

### 3.2 任务状态

- `created`：已创建，待执行
- `processing`：处理中
- `completed`：完成（产物可下载）
- `incomplete`：未完成（已上传部分产物，可续跑）
- `failed`：失败（系统错误或结算异常；需可续跑，且不浪费点数）

### 3.3 断点续传与不可中断

- 不允许用户主动取消/中断
- 失败后可续跑：重复发起同一 PDF 的生成笔记时，能复用既有产物从断点继续

---

## 4. 后端：数据库设计（字段要能直接支撑 UI/统计/续跑）

这一章给出一套“现在就落库用”的确定方案：4 张表，字段/枚举/索引都固定。断点续跑不靠记录断点步数，只靠产物文件存在性（本地或从 COS 回落下载）接续。

统一约定：

- 所有表均继承现有 `BaseEntity`（自增 `id` + `createdAt/updatedAt/deletedAt`）。
- 对外暴露任务 ID 统一用 `jobId`（UUID，`varchar(36)`，唯一）。
- COS Key 使用 `varchar(1024)`。
- JSON 字段使用 MySQL `json`。

### 4.1 表：note_gen_config（笔记生成配置）

表含义：

- 中文：笔记生成配置
- English：Note Generation Configuration

用途：Admin 管理“步骤参数 + 步骤使用模型名映射”。Job 创建时会把该配置完整快照固化到 `note_gen_job.configSnapshotJson`。

字段：

- `id: number`：主键（BaseEntity）。
- `enabled: boolean`：是否启用（业务层强制同一时间只允许 1 条为 true）。
- `version: number`：版本号（每次修改 +1）。
- `name: string`：配置显示名。
- `configSchemaVersion: number`：配置结构版本（初始为 1）。
- `configJson: json`：配置内容（按“步骤号 → 配置块 + 使用模型名”组织）。
- `updatedByAdminId: number`：最后修改管理员。
- `remark: string`：变更说明。
- `createdAt/updatedAt/deletedAt`：BaseEntity。

约束与索引：

- `idx_note_gen_config_enabled(enabled)`。
- `idx_note_gen_config_updatedAt(updatedAt)`。

### 4.2 表：note_gen_job（任务主表）

表含义：

- 中文：笔记生成任务（同时承载未来其他 PDF 流水线任务）
- English：Note Generation Job

用途：支撑 Chat 进度/点数/下载，支撑 Admin 审计/统计/排错，支撑 Worker 续跑与 7 天清理。

字段：

业务标识

- `id: number`：主键（BaseEntity）。
- `jobId: string`：对外任务 ID（UUID）。
- `userId: number`：发起用户。
- `kbPdfId: number`：来源 PDF（`kb_pdf.id`）。

流水线定义（用于复用同表）

- `pipelineKey: string`：`generate-notes` | `generate-anki` | `reset-pages` | `custom`。
- `stepsJson: json`：步骤号数组（保留顺序）。示例：`[1,2,3,4,5,8]`。
- `pageRangeJson: json`：页范围参数：
  - 全页：`{ "mode": "all" }`
  - 按页重置：`{ "mode": "pages", "pages": [12, 13] }`
  - 区间：`{ "mode": "range", "start": 1, "end": 10 }`
- `requestJson: json`：本次请求快照（把创建任务时的关键输入字段整体固化，便于 Admin 审计与复现）。

输入快照（从 `kb_pdf` 冗余固化，保证复现）

- `pdfCosBucket: string`
- `pdfCosRegion: string`
- `pdfCosKey: string`
- `pdfEtag: string`
- `pdfFileName: string`
- `pdfSizeBytes: number`（bigint）
- `pageCount: number`

状态与进度（面向 Chat）

- `status: string`：`created` | `processing` | `completed` | `incomplete` | `failed`。
- `progressPercent: number`：0~100。
- `startedAt: datetime`：首次开始执行时间。
- `completedAt: datetime`：完成时间（completed 时写入）。

配置快照（保证 job 语义稳定）

- `configId: number`：创建任务时使用的 `note_gen_config.id`。
- `configVersion: number`：创建任务时的配置版本号。
- `configSnapshotJson: json`：创建任务时固化的完整配置快照。

计费（完工后结算的基础字段）

- `estimatedCostMinPoints: number`：预计最小点数（后端根据页数计算）。
- `estimatedCostMaxPoints: number`：预计最大点数（后端根据页数计算）。
- `chargedPoints: number`：该 job 最终结算扣除的总点数。
- `chargeStatus: string`：`not_charged` | `charging` | `charged` | `partial`。
- `deductType: number`：扣费类型（对齐现有系统枚举）。

幂等（防止重复创建/重复扣费）

- `idempotencyKey: string`：同一用户对同一 PDF、同一配置、同一 pageRange 的幂等键。

存储与清理

- `resultCosPrefix: string`：该 job 所有产物的 COS 前缀目录（通常与源 PDF 所在目录一致，以便续跑时整体下载）。
- `cosUploadStatus: string`：`not_started` | `uploading` | `done` | `failed`。
- `cosUploadedAt: datetime`：上传完成时间。
- `cleanupAt: datetime`：计划清理时间（completed 时写入 now+7d）。

错误诊断（Admin 排错）

- `lastErrorCode: string`
- `lastErrorMessage: string`（1024）
- `lastErrorAt: datetime`
- `lastErrorStack: text`

约束与索引：

- `uniq_note_gen_job_jobId(jobId)`。
- `uniq_note_gen_job_user_idempotency(userId, idempotencyKey)`。
- `idx_note_gen_job_user_status_updated(userId, status, updatedAt)`。
- `idx_note_gen_job_kbpdf_status(kbPdfId, status)`。
- `idx_note_gen_job_cleanup(status, cleanupAt)`。

### 4.3 表：note_gen_job_step_usage（步骤用量明细）

表含义：

- 中文：任务-步骤用量明细
- English：Job Step Usage

用途：每个 job 的每个 step 只保留一条记录（upsert 覆盖），作为计费与统计的事实来源。

字段：

- `id: number`：主键（BaseEntity）。
- `jobId: string`：关联 `note_gen_job.jobId`。
- `stepNumber: number`：步骤号（覆盖 1..N，包括 9/10/11）。
- `status: string`：`success` | `failed` | `skipped`。
- `startedAt: datetime`
- `endedAt: datetime`

模型与用量

- `modelName: string`：用于该 step 的模型名（对齐 admin 模型配置）。
- `provider: string`：供应商标识（openai/gemini/...）。
- `promptTokens: number`
- `completionTokens: number`
- `totalTokens: number`
- `providerCost: number`：上游成本。

结算（用于统计与审计，实际扣费在 Job 完工后执行）

- `chargeStatus: string`：`not_charged` | `charged`（标记该步骤用量是否已计入 Job 结算）。
- `chargedPoints: number`：该 step 对应的折算点数。
- `chargedAt: datetime`

错误

- `errorCode: string`
- `errorMessage: string`（1024）

约束与索引：

- `uniq_note_gen_step_usage_job_step(jobId, stepNumber)`。
- `idx_note_gen_step_usage_job(jobId)`。
- `idx_note_gen_step_usage_step_model(stepNumber, modelName, endedAt)`。

### 4.4 表：note_gen_job_artifact（产物表）

表含义：

- 中文：任务-产物
- English：Job Artifact

用途：Chat 下载列表与 Admin 审计。产物存在即代表可复用（续跑会直接跳过已生成且已上传成功的产物）。

字段：

- `id: number`：主键（BaseEntity）。
- `jobId: string`：关联 `note_gen_job.jobId`。
- `type: string`：`markdown-markmap` | `word`。
- `status: string`：`ready` | `uploading` | `failed`。
- `fileName: string`：用户下载时展示名。
- `contentType: string`：MIME。
- `cosBucket: string`
- `cosRegion: string`
- `cosKey: string`
- `sizeBytes: number`（bigint）
- `etag: string`

约束与索引：

- `uniq_note_gen_artifact_job_type(jobId, type)`。
- `idx_note_gen_artifact_job(jobId)`。

---

## 5. 后端：API 设计（先对齐 Chat，再补齐 Admin）

> 设计原则：
>
> - 全部接口使用现有 JWT 鉴权（`@UseGuards(JwtAuthGuard)`），Admin 使用 AdminAuthGuard。
> - 任务创建与查询使用 jobId，避免暴露 COS key 细节。
> - 进度对用户只暴露 0~100% 数字，不暴露内部步骤名称。
> - 不允许取消任务。

### 5.0 统一约定（固定，不再分叉）

- 路由前缀：Chat 侧统一使用 `/note-gen`；Admin 侧统一使用 `/admin/note-gen`。
- 鉴权：
  - Chat：Controller 级别 `@UseGuards(JwtAuthGuard)`；从 `req.user.id` 取 `userId`。
  - Admin：Controller 级别 `@UseGuards(AdminAuthGuard)`。
- 响应体：与现有 KB 模块一致，直接返回 JSON 对象，不额外包一层 `data/code/message`。
- 时间字段：统一返回 ISO 字符串（`new Date().toISOString()`）；仅 COS 签名接口返回 `expiresAt`（Unix 秒）以对齐 KB 的 `{ url, expiresAt }`。
- 枚举固定：
  - `NoteGenJobStatus = 'created' | 'processing' | 'completed' | 'incomplete' | 'failed'`
  - `NoteGenChargeStatus = 'not_charged' | 'charging' | 'charged' | 'partial'`
  - `NoteGenArtifactType = 'markdown-markmap' | 'word'`
  - `NoteGenArtifactStatus = 'ready' | 'uploading' | 'failed'`
- 本期 pageRange：接口仍保留字段，但仅允许 `{ mode: 'all' }`；其它值一律 400。
- 下载签名策略（确定版）：
  - `GET /note-gen/jobs/:jobId` **不返回**签名 URL（避免轮询导致 URL 过期/浪费）。
  - 前端点击下载时调用 `GET /note-gen/jobs/:jobId/files/:fileType/signed-url` 获取短期 URL，并立即打开下载。
  - 签名 URL 过期秒数与 KB 完全一致（读取现有全局配置 `kbCosSignedUrlExpiresSeconds`，默认 60 秒），返回结构对齐 KB：`{ url, expiresAt }`。

### 5.1 Chat 侧 API

#### 5.1.1 创建生成笔记任务

- `POST /note-gen/jobs`
- Auth：JWT（`JwtAuthGuard`）

请求体（`CreateNoteGenJobDto`）：

- `kbPdfId: number`（必填，整数）
- `pageRange: { mode: 'all' }`（必填；仅允许 all）
- `configSnapshotId?: number`（可选，整数；指定某条 `note_gen_config.id`；不传则使用当前启用配置）

创建语义（幂等与门槛校验确定版）：

- **准入门槛校验**：后端查询用户当前余额，必须 **≥ 10 积分** 才能发起任务。
- **预计点数计算**：后端根据 PDF 页数计算 `pageCount * (1.0 ~ 2.0)`，写入 `estimatedCostPoints`。
- **幂等键计算**：
  - **计算公式**：`sha256(userId + "-" + kbPdfId + "-" + pipelineKey + "-" + pageRangeJson + "-" + configId + "-" + configVersion + "-" + (pdfEtag || ""))`
  - 存入 `note_gen_job.idempotencyKey`
- **幂等处理**：若发现同一 `userId + idempotencyKey` 已存在 job：直接返回已存在 job（不新建、不重复扣费）。

返回（`CreateNoteGenJobResponseDto`）：

- `jobId: string`（UUID）
- `status: NoteGenJobStatus`
- `progressPercent: number`（创建时为 0）
- `estimatedCostPoints: { min: number; max: number }`（后端实时计算返回）
- `chargedPoints: number`（创建时为 0）
- `chargeStatus: NoteGenChargeStatus`（创建时为 `not_charged`）
- `createdAt: string`（ISO）
- `updatedAt: string`（ISO）

错误（HTTP）：

- 400：`kbPdfId` 非法；`pageRange.mode` 非 `all`；配置不存在；PDF 记录缺少 COS 关键字段；**余额不足 10 积分**
- 401：未登录
- 404：`kbPdfId` 不存在或不属于该用户

#### 5.1.2 查询任务详情（含进度/点数/下载）

- `GET /note-gen/jobs/:jobId`
- Auth：JWT

返回（`NoteGenJobDetailDto`，用于 Chat 轮询）：

- `jobId: string`
- `kbPdfId: number`
- `status: NoteGenJobStatus`
- `progressPercent: number`（0~100；worker 内部按 6 段等分映射写入）
- `estimatedCostPoints: { min: number; max: number }`
- `chargedPoints: number`
- `chargeStatus: NoteGenChargeStatus`
- `updatedAt: string`（ISO）

失败/未完成提示（给 Chat 展示用，字段固定）：

- `userMessage?: string`
  - `failed`：固定文案：`"任务未完成（可续跑）：不会浪费点数，请稍后重试或稍后再次发起生成。"`
  - `incomplete`：固定文案：`"任务未完成（可续跑）：已生成部分结果，后续继续不会重复扣费。"`

结果文件列表（无 URL；用于渲染 2 个下载卡片）：

- `resultFiles: Array<{ type: NoteGenArtifactType; status: NoteGenArtifactStatus; fileName: string; sizeBytes: number; updatedAt: string }>`
  - 规则：仅当 `status=completed` 且该 type 的 artifact `status=ready` 时，`resultFiles` 包含该条。

错误（HTTP）：

- 400：`jobId` 非法
- 401：未登录
- 404：job 不存在或不属于该用户

#### 5.1.3 下载产物（签名 URL，确定版：单独接口）

- `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`
- Auth：JWT

Path 参数：

- `jobId: string`（UUID）
- `fileType: 'markdown-markmap' | 'word'`

返回（对齐 KB 的返回结构）：

- `{ url: string; expiresAt: number }`

权限与可用性规则（固定）：

- job 必须属于当前用户
- job 状态必须为 `completed`
- 目标 artifact 必须存在且 `status=ready` 且包含 `cosBucket/cosRegion/cosKey`

错误（HTTP）：

- 400：`jobId` 非法；`fileType` 非法
- 401：未登录
- 404：job 不存在/不属于该用户；或 artifact 不存在
- 409：artifact 存在但尚未 ready（`uploading`）
- 500：artifact COS 字段缺失；COS 签名失败

### 5.2 Admin 侧 API

#### 5.2.1 获取/更新“笔记生成配置”

- `GET /admin/note-gen/config`
- Auth：AdminAuthGuard

返回（`AdminNoteGenConfigDto`）：

- `id: number`
- `enabled: boolean`（永远返回当前 `enabled=true` 的那条）
- `version: number`
- `name: string`
- `configSchemaVersion: number`（固定为 1）
- `configJson: any`（结构固定如下）
- `updatedByAdminId: number`
- `remark: string`
- `updatedAt: string`（ISO）

`configJson` 结构（SchemaVersion=1，固定字段名）：

```json
{
  "steps": {
    "1": { "modelName": "...", "concurrency": 1, "maxRetries": 2, "zoom": 2.0 },
    "2": { "modelName": "...", "chunkSize": 8, "overlapPages": 1 },
    "3": { "softLimitChars": 12000, "hardLimitChars": 16000 },
    "4": { "modelName": "...", "concurrency": 1, "maxRetries": 2 },
    "5": { "reserved": true },
    "8": { "outputs": { "markdownMarkmap": true, "word": true } }
  }
}
```

- 约束：Step 1/2/4 的 `modelName` 必须是 Admin 模型管理中可用的“模型名称”；Step 8 输出固定两种均为 true（本期不做开关）。

更新：

- `PUT /admin/note-gen/config`
- Auth：AdminAuthGuard

请求体（`UpdateNoteGenConfigDto`）：

- `name: string`（必填）
- `remark: string`（必填）
- `configJson: any`（必填，结构必须满足 SchemaVersion=1）

更新语义（确定版）：

- 每次 PUT 都创建一条新记录：`version = previous.version + 1`，并将其 `enabled=true`；同时将旧的 enabled 记录置为 `enabled=false`（保证同一时刻只有 1 条启用）。
- 返回最新启用配置（与 GET 返回同结构）。

#### 5.2.2 笔记管理列表/详情

列表：

- `GET /admin/note-gen/jobs`
- Auth：AdminAuthGuard

Query 参数（固定）：

- `page?: number`（默认 1）
- `size?: number`（默认 20）
- `status?: NoteGenJobStatus`
- `userId?: number`
- `kbPdfId?: number`
- `jobId?: string`

返回（`AdminNoteGenJobListDto`）：

- `page: number`
- `size: number`
- `total: number`
- `items: Array<{ jobId: string; userId: number; kbPdfId: number; pipelineKey: string; status: NoteGenJobStatus; progressPercent: number; chargedPoints: number; chargeStatus: NoteGenChargeStatus; configId: number; configVersion: number; updatedAt: string; }>`

详情：

- `GET /admin/note-gen/jobs/:jobId`
- Auth：AdminAuthGuard

返回（`AdminNoteGenJobDetailDto`，字段覆盖审计/排错/统计）：

- `job: { ...note_gen_job 全量可读字段（除敏感密钥外） }`
- `steps: Array<{ stepNumber: number; status: 'success' | 'failed' | 'skipped'; startedAt: string; endedAt: string; modelName: string; provider: string; promptTokens: number; completionTokens: number; totalTokens: number; providerCost: number; chargeStatus: 'not_charged' | 'charged'; chargedPoints: number; chargedAt: string; errorCode?: string; errorMessage?: string; }>`
- `artifacts: Array<{ type: NoteGenArtifactType; status: NoteGenArtifactStatus; fileName: string; contentType: string; cosBucket: string; cosRegion: string; cosKey: string; sizeBytes: number; etag: string; updatedAt: string; }>`

Admin 下载（确定版）：

- `GET /admin/note-gen/jobs/:jobId/files/:fileType/signed-url`
- Auth：AdminAuthGuard
- 返回：`{ url: string; expiresAt: number }`（与 KB/Chat 对齐）
- 规则：仅校验 job 与 artifact 存在且 artifact `status=ready`；不做 owner 限制。

---

## 6. 处理流水线（Python 3.11 Worker）：执行与断点续传

> 章节目标：在第 4/5 章“表结构 + API 契约”已完成的前提下，将 `pdf_to_anki/src` 改造成可被 99AI-ANKI 调度的 **Python 3.11 Worker**：异步执行 `generate-notes`（steps 1,2,3,4,5,8），可断点续跑、可写库进度/用量/产物、可上传 COS，最终让 Chat 按第 5 章接口稳定交付下载。

### 6.0 术语与边界（固定）

- **99AI-ANKI service（NestJS）**：对外提供 Chat/Admin API；维护 DB（第 4 章四张表）；负责创建 job、幂等、**计费审查（门槛校验）与最终扣费结算**。
- **pdf_to_anki Worker（FastAPI）**：**计费纯粹化**：仅做流水线计算与 COS I/O；按本章规则写入/更新 `note_gen_job`、`note_gen_job_step_usage`（仅报账 Token 用量）、`note_gen_job_artifact`；**不参与任何计费逻辑审查，仅在完工后发送结算信号**。
- **断点续传**：不记录“断点步数”，以“step_usage 成功记录 + 本地/ COS 产物存在性”决定跳过/继续。
- **不可中断**：Worker 不提供取消/中断接口。
- **代码结构**：遵循 `src/api/` (接口), `src/core/` (逻辑), `src/services/` (外部服务) 的模块化结构。

### 6.1 执行范围（本期固定）

- pipelineKey：`generate-notes`
- steps：`[1,2,3,4,5,8]`
- pageRange：本期固定 `{ "mode": "all" }`
- 产物：
  - `markdown-markmap`（Markmap Markdown）
  - `word`（.docx）

### 6.2 Worker 鉴权（确定版）

Worker 所有业务接口必须使用 Header 鉴权：

- Header：`X-Worker-Token: <token>`
- Token 来源：Worker 环境变量 `PDF_TO_ANKI_WORKER_TOKEN`
- 未携带或不匹配：返回 401，响应体固定：`{ "detail": "unauthorized" }`

### 6.3 Worker API 路由（本期确定版）

API 前缀：`/api/pdf-note`

- 健康检查：`GET /api/pdf-note/health`（无鉴权，返回 `{ "status": "ok" }`）
- 生成笔记（异步）：`POST /api/pdf-note/generate-notes`（鉴权 + 校验 + 立即 202）
- 查询任务（仅用于联调/排错，可选保留）：`GET /api/pdf-note/jobs/{jobId}`（鉴权，数据来源优先 DB）

> 对用户展示/轮询必须走第 5 章：`GET /note-gen/jobs/:jobId`（读 DB）。Worker 查询接口仅用于联调与排错。

### 6.4 Worker 输入契约（确定版，严格校验）

`POST /api/pdf-note/generate-notes` 请求体（字段名固定）：

```json
{
  "jobId": "uuid",
  "userId": 123,
  "kbPdfId": 456,
  "pipelineKey": "generate-notes",
  "steps": [1,2,3,4,5,8],
  "pageRange": {"mode": "all"},
  "pdf": {
    "cosBucket": "...",
    "cosRegion": "...",
    "cosKey": "kb/123/xxx.pdf",
    "etag": "...",
    "sizeBytes": 123456,
    "pageCount": 100,
    "fileName": "..."
  },
  "resultCosPrefix": "kb/123/folder/",
  "configSnapshot": { "configSchemaVersion": 1, "steps": { "1": {}, "2": {}, "3": {}, "4": {}, "5": {}, "8": {} } }
}
```

一致性校验规则（固定）：

- `pipelineKey` 必须为 `generate-notes`
- `steps` 必须严格等于 `[1,2,3,4,5,8]`
- `pageRange.mode` 必须为 `all`
- `pdf.*` 字段必须齐全且非空

校验通过后立即返回 202：`{ "accepted": true, "jobId": "uuid" }`。

### 6.5 Worker 运行形态与本地目录（确定版）

#### 6.5.1 并发与幂等

- 同一 `jobId` 在任意时刻最多 1 个实例执行。
- 重复调用启动接口必须幂等：仍返回 202，但不重复启动。

#### 6.5.2 本地工作目录（确定版）

本地目录固定：

- `work/kb/{userId}/{kbPdfId}/`
  - `source.pdf`：从 COS 下载的源文件（同一 `kbPdfId` 可被多个 job 复用）；
  - `*.md`, `*.json` 等：本 job 的中间产物与最终产物（直接存放在根目录下，复用 `pdf_to_anki` 的产物结构）；
  - `progress.json`（可选）：用于内部观测，DB 的 `progressPercent` 为最终显示源。

> 断点续传以根目录下文件存在性为准；若本地缺失但 COS 已有，则从 COS 回落下载。

#### 6.5.3 显式步骤参数与环境覆盖（与 `runner.run_steps` 对齐）

- `pdf_to_anki/src/core/runner.py` 的 `run_steps(steps, env_overrides)` 会把 `env_overrides` 合并到当前环境后再构建 `PipelineConfig`，并以 `PDF_TO_ANKI_STEPS` 环境变量驱动实际要执行的 steps。Worker 的实现应利用该机制把请求中的 `configSnapshot` / step-specific 参数注入为环境变量，从而实现“每个 job 的独立配置快照”与“显式传参”。
- `pdf_to_anki/src/core/config.py` 中的 `_parse_steps(raw_value, is_worker_mode)`：当处于 Worker 模式（存在 `PDF_TO_ANKI_JOB_ID`）且未显式提供 `PDF_TO_ANKI_STEPS` 时，函数返回空列表以避免在环境加载时误触发全部 steps（这是防护机制）。因此 Worker 在派发 `run_steps` 时**必须**显式设置 `PDF_TO_ANKI_STEPS`（即便是完整序列 `1,2,3,4,5,8`），或在 `env_overrides` 中传入 `PDF_TO_ANKI_STEPS='all'`。
- 建议的 env 注入映射（示例）：
  - `PDF_TO_ANKI_STEPS` = `1,2,3,4,5,8`
  - 对于 step 特定参数（例如 Step1 的 zoom 或 Step2 的 chunk-size），采用命名空间前缀：`PDF_TO_ANKI_STEP1_ZOOM`, `PDF_TO_ANKI_STEP2_CHUNK_SIZE` 等；这些会被 `PipelineConfig.from_env()` 读取并固化到配置对象中，保证每个 job 的配置隔离（与第 3.5 章中 `PipelineConfig` 冻结行为一致）。

示例行为：Worker 在收到 `generate-notes` 请求后，将 `configSnapshot` 中的配置展平成若干 `PDF_TO_ANKI_*` 环境变量，调用 `run_steps([1,2,3,4,5,8], env_overrides)` 启动真实流水线，确保 `PipelineConfig` 反映该 job 的快照配置并写入到产物命名/路径中。

### 6.6 进度映射（确定版：6 段，严格单调）

Worker 写入 `note_gen_job.progressPercent` 的规则固定如下：

- 步骤序列：`[1,2,3,4,5,8]`
- 段数固定 6，每段占比 $100/6=16.666...$。
- 完成第 i 段后：
  - `progressPercent = floor(i * 100 / 6)`（即 16/33/50/66/83/100）
  - 写库时必须 `progressPercent = max(旧值, 新值)`，不允许回退

状态写入（固定）：

- 启动执行时：若当前 `status=created|incomplete|failed`，置为 `processing`，写 `startedAt`（若为空）
- 成功：全部步骤完成且产物上传完成后，写 `status=completed`、`progressPercent=100`、`completedAt`、`cleanupAt=now+7d`
- 失败：Worker 内部异常统一写 `status=incomplete`（可续跑）并写 `lastError*`

### 6.7 断点续传（确定版：跳过优先级）

对每个 step，Worker 在执行前必须按以下优先级判断是否跳过：

1) 若 `note_gen_job_step_usage(jobId, stepNumber)` 已存在且 `status=success`：直接跳过该 step
2) 否则检查本地对应产物文件是否存在：存在则跳过，并补写 step_usage（若缺失）
3) 否则检查 COS `resultCosPrefix` 下对应文件是否存在：存在则下载回落到本地，跳过，并补写 step_usage
4) 否则执行该 step

> 本期只实现 generate-notes；reset-pages 的“重置删除”逻辑为后续扩展占位，不在本期实现。

### 6.8 产物规范（确定版：类型、标准名、兼容策略）

ArtifactType（固定，对齐第 5 章 / 代码实现）：

- `markdown-markmap`：文件由 `PipelineConfig.markmap_notes_file` 决定，当前实现生成名格式为 `{book_name}_知识点思维导图.md`，`contentType=text/markdown`。
- `markdown`（若同时生成纯 Markdown）：由 `PipelineConfig.markdown_notes_file` 决定，当前实现生成名格式为 `{book_name}_知识点笔记.md`，`contentType=text/markdown`。
- `word`：文件由 `PipelineConfig.word_notes_file` 决定，当前实现生成名格式为 `{book_name}_知识点笔记.docx`，`contentType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`。

与 `pdf_to_anki/src` 现状兼容（固定策略）：

- 代码中以 `PipelineConfig` 属性为最终产物命名来源；若现有 step8 脚本产生了其它命名（例如历史名 `knowledge_base_markmap_notes.md`），Worker 在上传前必须把产物按 `PipelineConfig` 的标准名复制/重命名或生成映射表，以保证写入 `note_gen_job_artifact.fileName` 时与本地/DB/前端显示一致。

### 6.9 COS 下载/上传与落库（确定版）

下载：

- 使用请求体 `pdf.cosBucket/cosRegion/cosKey` 下载 PDF 到：`work/kb/{userId}/{kbPdfId}/source.pdf`

上传：

- 上传到 `resultCosPrefix`（由 service 创建 job 时写入 `note_gen_job.resultCosPrefix`）
- 至少上传两份最终产物（标准名），并 best-effort 上传关键中间产物用于续跑

落库（必须对齐第 4 章）：

- `note_gen_job`

  - 上传开始：`cosUploadStatus=uploading`
  - 上传完成：`cosUploadStatus=done`、`cosUploadedAt=now`
  - 上传失败：`cosUploadStatus=failed`（job 可标记 incomplete 允许续跑）
- `note_gen_job_artifact`（uniq(jobId, type) upsert）

  - 上传中：`status=uploading`
  - 上传成功：`status=ready`，并写 `fileName/contentType/cosBucket/cosRegion/cosKey/sizeBytes/etag`

> 重要：Worker 不发放 signed-url。用户点击下载时，必须走第 5.1.3 的 service 签名接口（expiresSeconds 复用 KB 配置）。

### 6.10 StepUsage 落库规则（确定版）

每个 step 执行结束后 Worker 必须 upsert 一条 `note_gen_job_step_usage`（uniq(jobId, stepNumber)）：

- `status: success|failed|skipped`
- `startedAt/endedAt`
- `modelName/provider/promptTokens/completionTokens/totalTokens/providerCost`
- `errorCode/errorMessage`（失败时写）

扣费字段约束（固定）：

- `chargedPoints/chargedAt/chargeStatus` 由 99AI-ANKI 扣费逻辑写入；Worker 不写。

### 6.11 错误处理（确定版）

Worker 接口错误（HTTP）：

- 400：请求体缺字段/枚举非法/steps 与 pipelineKey 不匹配
- 401：`X-Worker-Token` 不合法
- 500：Worker 内部异常

Job 错误字段写入（固定）：

- `note_gen_job.lastErrorCode = 'WORKER_EXCEPTION'`
- `lastErrorMessage`：异常 message（最长 1024）
- `lastErrorStack`：异常堆栈
- `lastErrorAt = now`
- `status = incomplete`

### 6.12 第 6 章实现顺序（直接对齐步骤流程，按最小可测试增量推进）

> 你在第 4/5 章完成后，按下面顺序完成 Worker 改造即可。每一步都有明确测试点，能确保最终闭环。

#### 第 1 阶段：先跑通 Worker 形态（不接 COS/DB）

1)（步骤流程 0）基线确认：`uvicorn api_main:app --reload --port 8000`，`GET /api/pdf-note/health` 返回 ok
2)（步骤流程 1）增加 `X-Worker-Token` 鉴权（除 health 与 / 外）
3)（步骤流程 2）固定 3 个启动接口的新请求体契约：只校验 + 立即 202，不跑 pipeline
4)（步骤流程 3）增加最小内存 registry + `GET /api/pdf-note/jobs/{jobId}` 查询（用于联调）
5)（步骤流程 4）加入后台执行骨架：模拟异步执行（sleep），状态能从 processing 变 completed

#### 第 2 阶段：接入真实 pipeline（本地模式）

6)（步骤流程 5）接入真实 `generate-notes` 执行：允许临时 `localPdfPath` 绕过 COS 下载；执行过程中按 6 段写 registry（单调递增）
7)（步骤流程 6）生成两份最终产物并固定命名：确保以 `PipelineConfig` 命名规则生成产物（示例：`{book_name}_知识点笔记.md`、`{book_name}_知识点思维导图.md`、`{book_name}_知识点笔记.docx`），并在上传时以这些文件名写入 `note_gen_job_artifact.fileName`。

#### 第 3 阶段：对齐第 4/5 章闭环（COS + MySQL 写库 + 结算触发）

8)（步骤流程 7）接入 COS：去掉 `localPdfPath`；下载 source.pdf；上传产物/必要中间产物到 `resultCosPrefix`
9)（步骤流程 8）接入 MySQL：执行过程中写入 `note_gen_job/step_usage/artifact`；Worker 查询接口可切到读 DB
10)（步骤流程 9）触发结算：在 `report_artifacts` 成功后，调用 99AI 后端的 `charge-job` 接口发送完工结算信号。

完成以上 9 步后，本章视为完成。接下来进入第 7~10 章：

- 第 7 章：7 天清理（本地目录清理；COS 保留）
- 第 8 章：计费落地（扣费逻辑在 service；Worker 上报用量）
- 第 9~10 章：Admin/Chat UI（依赖第 5 章 API 与第 4 章数据）

### 6.13 与现有 `pdf_to_anki/src` 的文件级改造点（按落地顺序的最小清单）

为保证“改动最小、可测试”，建议按以下文件顺序改造：

1) `pdf_to_anki/src/api/main.py`
   - 加鉴权
   - 将 3 个 POST 改为：校验请求体 → 入队/后台任务 → 立即 202
2) `pdf_to_anki/src/api/auth.py`
   - 鉴权依赖/函数
3) 新增 `pdf_to_anki/src/api/models.py`
   - Pydantic 请求体模型
4) 新增 `pdf_to_anki/src/core/validation.py`
   - pipelineKey/steps/pageRange 一致性校验
5) 新增 `pdf_to_anki/src/core/registry.py`
   - 内存 registry（联调阶段使用；后续可被 DB 取代）
6) `pdf_to_anki/src/core/runner.py` / `run_steps`
   - 增加“显式工作目录（work/kb/{userId}/{kbPdfId}）”与“按 configSnapshot 覆盖 env”的桥接
7) `pdf_to_anki/src/core/config.py`
   - 支持 jobId 子目录与标准产物名的写入路径

---

## 7. 存储与同步（COS + 本地目录）与 7 天清理

章节目标：把第 6 章的“本地断点续跑目录”与第 4/5 章的“可下载交付（artifact）”统一到一套确定的存储、同步与删除规范，确保：

- 任务失败/重试不浪费：本地与 COS 都能支撑续跑；
- 任务完成可交付：COS 上有稳定的最终产物，service 可按第 5 章签名下载；
- 存储可控：自动清理本地临时数据，且用户/管理员在删除 COS 数据时得到明确提示与可选的级联删除。

### 7.1 存储事实来源与责任

- 本地（Worker 节点）为“执行与断点续跑”的第一事实来源，负责短期保留中间产物与快速恢复；Worker 负责本地清理任务。
- COS 为长期保存与对外交付的事实来源（signed URL 由 service 在下载时生成）；DB（`note_gen_job`, `note_gen_job_artifact`）为状态与审计事实来源。

三者协同规则：Worker 可从 COS 回落下载缺失产物以支持续跑；Worker 上传完成后更新 artifact 表与 `note_gen_job.cosUploadStatus`。DB 记录是所有自动化决策（续跑、清理、删除确认）的唯一依据。

### 7.2 本地目录结构（确定版）

- 根目录（可配置，默认 `work`）：`work/kb/{userId}/{kbPdfId}/`
- 约定：
  - `source.pdf`：从 COS 下载的源文件（同一 `kbPdfId` 可被多个 job 复用）；
  - `*.md`, `*.json` 等：本 job 的中间产物与最终产物（直接存放在根目录下，复用 `pdf_to_anki` 的产物结构）；
  - `progress.json`：可选，用于内部观测，DB 的 `progressPercent` 为最终显示源。

清理粒度原则：

- 优先按 `work/kb/{userId}/{kbPdfId}/` 粒度清理；仅当确认该 `kbPdfId` 无需本地文件支撑续跑的 job 时，才考虑删除 `source.pdf` 与父目录。

注意（与当前代码对齐）：

- `pdf_to_anki/src/core/config.py` 中的 `PipelineConfig` 在“Worker 模式”（存在 `job_id`）下将 `base_dir` 直接等同于 `output_root`。也就是说，Worker 在启动/执行时应通过环境变量把 `PDF_TO_ANKI_JOB_ID` 与 `PDF_TO_ANKI_OUTPUT_ROOT` 明确传入，且 `PDF_TO_ANKI_OUTPUT_ROOT` 应当指向 PDF 专属目录（即 `work/kb/{userId}/{kbPdfId}/`）。
- `PDF_TO_ANKI_BOOK_NAME` 用于生成最终产物的显示名（`PipelineConfig.book_name`），当未显式传入时会从 `PDF_TO_ANKI_PDF_PATH` 推断为 PDF 文件 stem。Worker 必须保证 `book_name` 与后台 `note_gen_job.pdfFileName`/KB 中的 PDF 名称语义一致，以便产物命名与后端记录对齐。
- 综上，Worker 启动/执行时推荐设置的环境变量（至少）为：

  - `PDF_TO_ANKI_JOB_ID` -> `jobId`
  - `PDF_TO_ANKI_OUTPUT_ROOT` -> absolute path to `work/kb/{userId}/{kbPdfId}/`
  - `PDF_TO_ANKI_BOOK_NAME` -> PDF 文件名（不含扩展名，用于产物命名）
  - （可选）`PDF_TO_ANKI_PDF_PATH` -> 本地源 PDF 路径（用于本地调试模式）

示例（程序内部效果）：

- 当 Worker 环境设置为 `PDF_TO_ANKI_OUTPUT_ROOT=.../work/kb/2/1/` 且 `PDF_TO_ANKI_BOOK_NAME=20251中学综合素质1-10` 时：
  - `PipelineConfig.base_dir == .../work/kb/2/1/`
  - 最终产物路径为：
    - `.../work/kb/2/1/20251中学综合素质1-10_知识点笔记.md`
    - `.../work/kb/2/1/20251中学综合素质1-10_知识点思维导图.md`
    - `.../work/kb/2/1/20251中学综合素质1-10_知识点笔记.docx`

该行为由 `pdf_to_anki/src/core/config.py` 中 `PipelineConfig.base_dir` 与 `markdown_notes_file/markmap_notes_file/word_notes_file` 属性确定，Worker 实现必须遵循以保证本地产物命名与后端 `note_gen_job_artifact.fileName` 字段一致。

### 7.3 COS 目录约定（确定版）

- 源 PDF：保存在现有 KB 路径，如 `kb/{userId}/.../*.pdf`（由 KB 模块管理）。
- 结果前缀（`resultCosPrefix`）：

  - **实际逻辑**：与源 PDF 所在目录保持一致，即 `os.path.dirname(pdf.cosKey) + "/"`。
  - **优势**：下载用户文件时，直接下载整个 PDF 所在的文件夹即可包含所有中间产物，极大方便了 Worker 的续跑与回落下载。
  - **约束**：前缀必须以 `/` 结尾。
- 产物 Key 规则：

  - 最终产物与中间产物：Worker 将本地 `work/kb/{userId}/{kbPdfId}/` 下的所有文件递归上传至 `resultCosPrefix`。
  - 最终产物 Key 示例：`resultCosPrefix + {book_name}_知识点笔记.md`。

说明：COS 路径不再按 `jobId` 隔离，而是按 `kbPdfId` 所在的目录扁平化存储。这保证了同一目录下的 PDF 可以共享中间产物环境，极大方便了 Worker 的整体同步与续跑。前端展示时需根据文件名或后缀过滤掉中间文件。

### 7.4 上传与同步策略（确定版）

目标：保证 completed 后 COS 上有稳定且可签名下载的最终产物，同时支持从 COS 回落下载以实现断点续传。

时机与规则：

1) 任务执行过程中：

- Worker 在每个步骤完成后更新 `note_gen_job_step_usage`。
- 首次进入上传流程时写 `note_gen_job.cosUploadStatus = 'uploading'`。

2) 全部步骤完成后：

- Worker 执行 `upload_directory`，将本地工作目录下的所有产物（MD/Word/JSON等）递归上传至 `resultCosPrefix`。
- 上传成功并在 `note_gen_job_artifact` 写入记录后，将 job 标为 `completed`。

上传必须保证幂等：artifact 写库采用 upsert。

Worker 启动时的回落策略：若本地缺少某个中间产物或最终产物且 DB 中记录存在对应 COS Key，则 Worker 应从 COS 下载回落，避免重复计算。

### 7.5 级联删除后端逻辑（当前实现状态）

背景：生成的笔记占用知识库空间，当用户删除 KB 中的 PDF 时，应清理相关资源。

**当前代码行为**：

1) 接口 `POST /kb/pdfs/:id/delete` 执行 `deleteFileCore`。
2) **COS 清理**：仅尝试删除 `kb_pdf` 记录对应的源 PDF 文件（`record.cosKey`）。
3) **DB 清理**：删除 `kb_pdf` 表中的记录。
4) **配额更新**：扣减 `kb_user_usage.usedBytes`。

**待对齐/后续增强**：

- 目前尚未实现对 `note_gen_job`、`note_gen_job_artifact` 以及 COS 上 `resultCosPrefix` 目录的级联删除。
- 建议后续在 `deleteFileCore` 中增加对该 `kbPdfId` 相关 job 的清理逻辑。

### 7.6 存储计量后端逻辑

- 生成的笔记与中间文件计入 KB 的存储配额（由服务端在 artifact 上传/删除时计入/扣除）。
- **注意**：当前代码仅在上传/删除源 PDF 时更新计量，生成产物的计量更新逻辑需在 Worker 上传完成后由服务端触发或定时任务汇总。

### 7.7 自动 7 天本地清理与“回落下载”机制

- 目的：释放 Worker 本地磁盘空间。
- 触发条件：`note_gen_job.status = 'completed'`。
- **执行者**：Python Worker 在更新任务状态为 `completed` 时，自动设置 `cleanupAt = NOW() + 7 Days`。
- **清理逻辑**：由 Worker 定时任务扫描并删除本地 `work/kb/{userId}/{kbPdfId}/` 目录。

**回落下载机制**：

- 若本地目录已被清理，但任务需要续跑（`status=incomplete/processing`）：
  - Worker 必须先从 `resultCosPrefix` 将 COS 上的中间产物同步回本地。

注意区分：

- 自动 7 天清理只清本地 Worker 节点的执行产物（不删除 COS）；
- 用户触发的级联删除（见 7.5）可选择同时在 COS 上删除 `resultCosPrefix` 下的全部文件并更新 DB，为用户真正释放 KB 存储。

### 7.8 失败、竞态与一致性考虑（工程约束）

- 同一用户的同一pdf，是否需要一个唯一jobid？不用，因为后续还有重新续跑，删除某页重新生成笔记等，只要处理的文件有就行，jobid不一样还方便后续的处理。
- **目录级一致性**：Worker 启动时应校验本地目录完整性。若发现 `note_gen_job_step_usage` 记录的步骤已完成但本地文件缺失，应触发从 COS 的回落下载。
- **并发锁**：使用 `job_semaphore` 限制单节点并发；使用 DB 状态锁（tombstone）避免删除与新建并发冲突。
- **上传原子性**：`upload_directory` 成功后才更新 `cosUploadStatus=success`；若部分失败，允许 job 保持 `incomplete` 状态以便重试。
- **删除/归档安全**：COS 删除为最终不可逆操作前应可选“先归档再删”；若服务支持对象版本或回收站（object lock / lifecycle），优先使用以降低误删风险。

---

（第7章设计已完全对齐 `pdf_to_anki/src` 的扁平化目录结构、COS 递归同步逻辑以及 7 天清理/回落机制。）

---

## 8. 计费与结算后端逻辑（点数 + Token）

> 章节目标：明确“预计点数如何算、准入门槛校验、完工后结算以及失败/续跑如何做到不重复扣费”，确保后端结算逻辑的严密性。

### 8.1 任务幂等与估算（确定版）

**幂等键计算公式（与代码 100% 对齐）**：

- `rawKey = userId + "-" + kbPdfId + "-" + pipelineKey + "-" + pageRangeJson + "-" + configId + "-" + configVersion + "-" + (pdfEtag || "")`
- `idempotencyKey = sha256(rawKey)`
- **作用**：确保同一用户对同一 PDF、同一配置、同一页码范围的请求不会创建重复任务，且续跑时能找回原任务。

**预计点数估算（确定版）**：

- **估算公式**：`pageCount * (1.0 ~ 2.0)` 点数。
- **示例**：10 页 PDF 预计消耗 10-20 积分。
- **实现**：由后端在 `createJob` 时根据 PDF 页数计算并写入 `estimatedCostMinPoints` 与 `estimatedCostMaxPoints`。

### 8.2 准入门槛校验（确定版）

为了防止恶意调用并保证基础服务成本，系统设置了任务发起的准入门槛：

- **校验逻辑**：在 `POST /note-gen/jobs` 创建任务时，后端会查询用户当前余额（`sumModel3Count + sumModel4Count`）。
- **门槛值**：用户账户余额必须 **≥ 10 积分**。
- **失败处理**：若余额不足 10 积分，直接返回 400 错误，提示“发起笔记生成任务至少需要 10 积分”。

### 8.3 完工后结算（确定版：任务完成后一次性扣费）

**设计目标**：为了提升用户体验，系统允许用户在余额较低时完成任务（支持扣至负数），并在任务全部成功交付后进行一次性结算。

- **扣费触发时机**：当 Worker 完成所有步骤（1,2,3,4,5,8）且产物成功上传至 COS 后，触发一次性结算。
- **结算接口**：`POST /api/worker/note-gen/charge-job`（仅限 Worker 调用）。
- **结算逻辑**：
  1) 汇总该 Job 下所有 `step_usage` 记录的 Token 消耗。
  2) 根据 Admin 配置的模型扣费策略计算总点数。
  3) 调用 `UserBalanceService.deductFromBalance` 执行扣费（允许余额为负）。
  4) 更新 Job 状态：`chargedPoints = 总点数`, `chargeStatus = 'charged'`。

### 8.4 任务级 chargeStatus 枚举与写入规则

`note_gen_job.chargeStatus` 枚举：`not_charged | charging | charged | partial`。

- **创建 Job**：初始为 `not_charged`。
- **结算开始**：进入结算流程时置为 `charging`。
- **结算成功**：全量扣费完成后置为 `charged`。
- **异常情况**：若因系统错误导致仅部分步骤被记录或结算中断，置为 `partial`。

### 8.5 失败、续跑与不重复扣费

- **失败续跑**：若任务在执行过程中失败（未进入结算阶段），用户再次发起时，Worker 会根据 `step_usage` 跳过已成功的步骤。
- **不重复扣费**：结算接口必须保证幂等。若 `chargeStatus` 已为 `charged`，重复调用结算接口应直接返回成功，不执行二次扣费。
- **透支充值**：由于允许余额扣为负值，用户在看到生成的笔记产物后，若觉得满意，可充值以抵消欠费并继续使用后续功能。

### 8.6 Admin 成本统计口径（确定版）

统计事实来源（固定）：`note_gen_job_step_usage`。

- **Token 统计**：`promptTokens/completionTokens/totalTokens` 直接汇总。
- **上游成本**：`providerCost` 按 stepNumber、modelName 聚合。
- **点数统计**：`chargedPoints` 以 Job 结算结果为准。

---

## 9. Admin 端需求（前端实现）

> 章节目标：把第 4/5/8 章已经定好的“表结构 + Admin API + 统计口径”落到 Admin UI 的最小闭环。

### 9.1 模型管理 → 笔记生成配置（二级目录）

菜单与路由（确定版）：

- 菜单位置：`模型管理` 下新增 children：`笔记生成配置`。
- 页面包含 2 个状态：查看当前启用配置 + 编辑并发布新版本。

数据来源（确定版）：

- 查看：`GET /admin/note-gen/config`
- 发布：`PUT /admin/note-gen/config`

页面字段（确定版）：

- 只读区：`id`、`enabled`、`version`、`updatedByAdminId`、`updatedAt`。
- 编辑区：`name`、`remark`、`configJson`（JSON 编辑器）。

### 9.2 数据管理 → 笔记管理

菜单与路由（确定版）：

- 菜单位置：`数据管理` 下新增 children：`笔记管理`。
- 该模块只读（本期不提供“改状态/重跑/清理”等写操作）。

数据来源（确定版）：

- 列表：`GET /admin/note-gen/jobs`
- 详情：`GET /admin/note-gen/jobs/:jobId`
- 下载：`GET /admin/note-gen/jobs/:jobId/files/:fileType/signed-url`

#### 9.2.1 列表页（确定版）

查询条件：`page/size/status/userId/kbPdfId/jobId`。
默认排序：`updatedAt` 倒序。
列表列：`jobId/userId/kbPdfId/pipelineKey/status/progressPercent/chargedPoints/chargeStatus/configId/configVersion/updatedAt`。

#### 9.2.2 详情页（确定版：审计/排错/下载）

页面区块：

1) 任务概览：`jobId/userId/kbPdfId/pipelineKey/status/progressPercent/estimatedCostMinPoints~estimatedCostMaxPoints/chargedPoints/chargeStatus/deductType/createdAt/updatedAt/startedAt/completedAt/cleanupAt`。
2) 输入 PDF 快照：`pdfCosBucket/pdfCosRegion/pdfCosKey/pdfEtag/pdfSizeBytes/pageCount`。
3) 存储状态：`resultCosPrefix/cosUploadStatus/cosUploadedAt`。
4) 产物列表：列 `type/status/fileName/contentType/sizeBytes/etag/updatedAt`，下载按钮。
5) Step 用量明细：列 `stepNumber/status/startedAt/endedAt/modelName/provider/totalTokens/providerCost/chargeStatus/chargedPoints/chargedAt/errorMessage`。
6) 错误信息：`lastErrorCode/lastErrorMessage/lastErrorAt/lastErrorStack`。

---

## 10. Chat 端需求（前端实现）

> 章节目标：在 Chat 内实现“选择 KB PDF → 创建任务 → 轮询进度 → 下载交付/失败续跑”闭环。

### 10.1 入口与按钮

- 位置：Chat Footer，按钮样式与现有 pill 按钮一致。
- icon：准备一个小图标。
- 交互：点击选中进入“生成笔记”模式，再次点击取消。选中后左上角模型选择不影响本功能。

### 10.2 参数选择与预计点数展示

必选输入（确定版）：

- `kbPdfId`：知识库中的一个 PDF 文档。
- `pageRange`：本期不可修改，固定 `{ mode: 'all' }`。

交互（确定版）：

- 进入“生成笔记”模式后，在输入框区域展示 PDF 选择器。
- 选中 PDF 后，调用 `GET /note-gen/config` 获取配置，并展示预计点数（当前固定展示 0）。
- 未选择 PDF 时，发送按钮应阻止提交并提示。

### 10.3 提交与进度轮询

提交动作（确定版）：

- 用户确认后调用 `POST /note-gen/jobs`。
- 创建成功后，在当前对话流中插入一条“任务卡片消息”，展示 `jobId`、`status`、`progressPercent`。

轮询与刷新（确定版）：

- 自动刷新：每 60 秒拉一次 `GET /note-gen/jobs/:jobId`。
- 手动刷新：卡片内提供“刷新”按钮。
- 进度展示：展示 6 段进度条（0~100%）及提示文案。

### 10.4 失败处理与续跑

状态展示（确定版）：

- `status=failed/incomplete`：展示 `userMessage` 错误信息。
- 操作按钮：显示“继续生成”按钮，点击后再次调用 `POST /note-gen/jobs` 触发幂等续跑。

### 10.5 产物下载与清理提示

完成判定（确定版）：

- 仅当 `status=completed` 且 `resultFiles` 包含 `markdown-markmap` 与 `word` 且均 `ready` 时展示下载区。

下载动作（确定版）：

- 点击文件卡片调用 `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`。
- 拿到 URL 后立即触发浏览器下载。
- 清理提示：提示“文件将在生成 7 天后自动清理，请及时保存”。

---

## 11. 交付清单（当前代码对齐版）

本期交付以“可用闭环”为准：用户能从 Chat 发起任务、看到进度、拿到两份下载产物；管理员能配置与排错；失败可续跑。

- 后端（99AI-ANKI service）：

  - 数据表与索引：`note_gen_config`、`note_gen_job`、`note_gen_job_step_usage`、`note_gen_job_artifact`（已实现）
  - Chat API：
    - `POST /note-gen/jobs`（已实现，含幂等逻辑）
    - `GET /note-gen/jobs/:jobId`（已实现，含产物列表）
    - `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`（已实现）
  - Admin API：
    - `GET/PUT /admin/note-gen/config`（已实现，含版本化逻辑）
    - `GET /admin/note-gen/jobs`、`GET /admin/note-gen/jobs/:jobId`（已实现）
  - 幂等键计算：`userId-kbPdfId-pipelineKey-pageRange-configId-configVersion-pdfEtag`（已实现）
- Worker（Python 3.11）：

  - Worker API：
    - `POST /api/pdf-note/generate-notes`（已实现）
  - 流水线能力：`generate-notes`，steps `[1,2,3,4,5,8]`（已实现）
  - 本地目录：`work/kb/{userId}/{kbPdfId}/`（已实现）
  - 存储与上传：递归上传本地目录至 `resultCosPrefix`（已实现）
  - 写库：进度更新、step_usage 记录、artifact 记录（已实现）
  - 7 天清理：Worker 自动设置 `cleanupAt`（已实现）
- Admin（99AI-ANKI/admin）：

  - `模型管理 → 笔记生成配置`（待前端实现）
  - `数据管理 → 笔记管理`（待前端实现）
- Chat（99AI-ANKI/chat）：

  - `生成笔记` 模式切换与 PDF 选择（待前端实现）
  - 任务卡片、进度轮询、下载按钮（待前端实现）

---

## 12. 后续扩展（仅占位，不在本期实现）

本期设计已为扩展预留：`pipelineKey/stepsJson/pageRangeJson`、step_usage 覆盖 1..N、artifact 表可扩展更多 type。

- 功能 2：生成 Anki（不做，仅占位）

  - 新增 pipelineKey：`generate-anki`
  - steps：`[1,2,3,4,5,6,7]`
  - Admin 配置：补齐 step6/7 的模型与参数
  - 产物：新增 anki 包或卡片文件（新增 artifact.type 枚举值）
- 功能 3：按页重置并重建（不做，仅占位）

  - 新增 pipelineKey：`reset-pages`
  - `pageRangeJson` 启用 range 模式，并在幂等键中纳入页范围
  - steps：`[9,3,4,5,8]`（第 9 步负责删除指定页相关批次/中间产物）
  - 需要明确“删除范围”与“保留范围”的产物规则，避免影响已完成交付
- Chat 端自定义页范围（不做，仅占位）

  - UI 增加页范围输入（all/range/single），并对齐 API 校验
  - 预计点数与幂等键计算需纳入页范围
