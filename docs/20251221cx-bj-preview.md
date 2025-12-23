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
- `failed`：点数不足，失败（系统错误；需可续跑，且不浪费点数）

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

计费（失败续跑不重复扣费的基础字段）

- `estimatedCostMinPoints: number`：预计最小点数。
- `estimatedCostMaxPoints: number`：预计最大点数。
- `chargedPoints: number`：该 job 已扣点数（聚合自 step_usage 的 chargedPoints）。
- `chargeStatus: string`：`not_charged` | `charging` | `charged` | `partial`。
- `deductType: number`：扣费类型（对齐现有系统枚举）。

幂等（防止重复创建/重复扣费）

- `idempotencyKey: string`：同一用户对同一 PDF、同一配置、同一 pageRange 的幂等键。

存储与清理

- `resultCosPrefix: string`：该 job 所有产物的 COS 前缀目录。
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

结算（保证失败续跑不重复扣费）

- `chargeStatus: string`：`not_charged` | `charged`。
- `chargedPoints: number`：该 step 已扣点数。
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

创建语义（幂等确定版）：

- 服务端计算 `idempotencyKey` 并落库：
  - 输入：`userId + kbPdfId + pipelineKey(generate-notes) + pageRange(mode=all) + configId + configVersion + pdfEtag`
  - 计算：对上述字段拼接后做 sha256，存入 `note_gen_job.idempotencyKey`
- 若发现同一 `userId + idempotencyKey` 已存在 job：直接返回已存在 job（不新建、不重复扣费）。

返回（`CreateNoteGenJobResponseDto`）：

- `jobId: string`（UUID）
- `status: NoteGenJobStatus`
- `progressPercent: number`（创建时为 0）
- `estimatedCostPoints: { min: number; max: number }`
- `chargedPoints: number`（创建时为 0）
- `chargeStatus: NoteGenChargeStatus`（创建时为 `not_charged`）
- `createdAt: string`（ISO）
- `updatedAt: string`（ISO）

错误（HTTP）：

- 400：`kbPdfId` 非法；`pageRange.mode` 非 `all`；配置不存在；PDF 记录缺少 COS 关键字段
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

- **99AI-ANKI service（NestJS）**：对外提供 Chat/Admin API；维护 DB（第 4 章四张表）；负责创建 job、幂等、扣费、签名下载。
- **pdf_to_anki Worker（FastAPI）**：仅做流水线计算与 COS I/O；按本章规则写入/更新 `note_gen_job`、`note_gen_job_step_usage`、`note_gen_job_artifact`。
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
  "resultCosPrefix": "kb/123/_note_gen/456/<jobId>/",
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
  - `source.pdf`
  - `pipeline/{jobId}/`（中间产物与最终产物）
  - `pipeline/{jobId}/progress.json`（可选）

> 断点续传以 `pipeline/{jobId}/` 内文件存在性为准；若本地缺失但 COS 已有，则从 COS 回落下载。

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
2) 否则检查本地 `pipeline/{jobId}/` 对应产物文件是否存在：存在则跳过，并补写 step_usage（若缺失）
3) 否则检查 COS `resultCosPrefix` 下对应文件是否存在：存在则下载回落到本地，跳过，并补写 step_usage
4) 否则执行该 step

> 本期只实现 generate-notes；reset-pages 的“重置删除”逻辑为后续扩展占位，不在本期实现。

### 6.8 产物规范（确定版：类型、标准名、兼容策略）

ArtifactType（固定，对齐第 5 章）：

- `markdown-markmap`：文件 `knowledge_base_notes_markmap.md`，`contentType=text/markdown`
- `word`：文件 `knowledge_base_notes.docx`，`contentType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`

与 `pdf_to_anki/src` 现状兼容（固定策略）：

- 若 step8 生成的是 `knowledge_base_markmap_notes.md`，Worker 必须复制/重命名为标准名 `knowledge_base_notes_markmap.md` 再上传与落库。

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
7)（步骤流程 6）生成两份最终产物并固定命名：确保 `knowledge_base_notes_markmap.md` 与 `knowledge_base_notes.docx` 均存在

#### 第 3 阶段：对齐第 4/5 章闭环（COS + MySQL 写库）

8)（步骤流程 7）接入 COS：去掉 `localPdfPath`；下载 source.pdf；上传产物/必要中间产物到 `resultCosPrefix`
9)（步骤流程 8）接入 MySQL：执行过程中写入 `note_gen_job/step_usage/artifact`；Worker 查询接口可切到读 DB

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
   - 增加“显式工作目录（pipeline/{jobId}）”与“按 configSnapshot 覆盖 env”的桥接
7) `pdf_to_anki/src/core/config.py`
   - 支持 jobId 子目录与标准产物名的写入路径


---

## 7. 存储与同步（COS + 本地目录）与 7 天清理

> 章节目标：把第 6 章的“本地断点续跑目录”与第 4/5 章的“可下载交付（artifact）”统一到一套确定的存储与清理规则中，确保：
>
> - 任务失败/重试不浪费：本地与 COS 都能支撑续跑
> - 任务完成可交付：COS 上有稳定的最终产物，service 可按第 5 章签名下载
> - 存储可控：完成 7 天后清理本地空间，不影响 COS 交付与历史审计

### 7.1 本地目录结构（建议）

本地目录是“执行与断点续跑”的第一事实来源，必须与第 6 章保持一致。

- 根目录（可配置，默认 `work`）：
  - `work/kb/{userId}/{kbPdfId}/`

目录内约定（确定版）：

- `source.pdf`
  - 从 COS 下载的源 PDF
  - 可被同一用户同一 PDF 的多个 job 复用
- `pipeline/{jobId}/`
  - 该 job 的中间产物与最终产物（完全复用 `pdf_to_anki/src` 的产物结构）
  - 允许存在 `progress.json`（调试/观测用）；对用户展示仍以 DB 的 `progressPercent` 为准

清理粒度原则（确定版）：

- 优先按 `pipeline/{jobId}` 粒度清理（更安全，避免误删仍在续跑的同 PDF 其它 job）
- 仅当确认该 `userId+kbPdfId` 没有任何“仍需本地文件支撑续跑”的 job 时，才清理整个 `work/kb/{userId}/{kbPdfId}`

### 7.2 COS 目录结构（用户不可见）

COS 是“跨机器/长期保存/交付下载”的事实来源，用户侧只通过 service 的签名 URL 访问。

- 现有 PDF（KB 模块已在用）：`kb/{userId}/.../*.pdf`
- 处理目录（用户端不可见，建议固定结构）：
  - `kb/{userId}/_note_gen/{kbPdfId}/{jobId}/...`

确定规则：

- `note_gen_job.resultCosPrefix` 必须指向该 job 的处理目录前缀，且以 `/` 结尾，例如：
  - `kb/{userId}/_note_gen/{kbPdfId}/{jobId}/`
- 最终产物的 COS Key 固定为：`resultCosPrefix + fileName`
  - `knowledge_base_notes_markmap.md`
  - `knowledge_base_notes.docx`

> 说明：本期只要求“最终产物可下载”。中间产物的 COS Key 可按 `resultCosPrefix + 'intermediate/...'` 组织，便于后续扩展与回落下载。

### 7.3 上传策略

上传策略目标（确定版）：

- 对外可交付：completed 后，COS 上必须存在两份最终产物
- 对内可续跑：processing/incomplete 时，best-effort 上传“已产生的关键内容”，为后续回落下载留口

上传时机（确定版，按风险从低到高）：

1) 每个 step 结束后（建议）：
   - best-effort 上传该 step 新产生的关键文件（或只上传 `progress.json` + 必要目录）
   - 立刻更新 `note_gen_job.cosUploadStatus=uploading`（首次进入上传流程时）
2) 全部步骤完成后（必须）：
   - 上传两份最终产物（标准名）
   - 两份产物都上传成功并落库 artifact=ready 后，才允许把 job 置为 completed

最小必须上传集合（本期确定）：

- 最终产物：
  - `knowledge_base_notes_markmap.md`
  - `knowledge_base_notes.docx`
- 建议附带（用于排错/续跑）：
  - `pipeline/{jobId}/progress.json`（若存在）
  - 与 step 8 直接相关的输入中间目录（例如 `anki_card_all/` 等，按现有产物结构选择最小必要集合）

上传状态写库（确定版）：

- 进入上传流程：`note_gen_job.cosUploadStatus=uploading`
- 上传全部必须文件成功：`note_gen_job.cosUploadStatus=done`，`cosUploadedAt=now`
- 上传失败：`note_gen_job.cosUploadStatus=failed`，job 允许保持/落为 `incomplete` 以支持重试

> 注意：第 5 章已明确 `GET /note-gen/jobs/:jobId` 不返回 signed url。signed url 只在下载时由 service 生成；Worker 不负责签名。

### 7.4 7 天清理

清理目标（确定版）：

- 释放 Worker 本地磁盘空间
- 不影响：
  - 用户下载（COS 保留）
  - Admin 审计与统计（DB 保留）
  - 仍可续跑的任务（created/processing/incomplete/failed 不清）

清理触发条件（确定版，以 DB 字段为准）：

- `note_gen_job.status = 'completed'`
- 且 `note_gen_job.cleanupAt <= now`

`cleanupAt` 写入规则（确定版）：

- Worker 在将 job 标记为 `completed` 时，同时写入：
  - `completedAt = now`
  - `cleanupAt = now + 7d`

清理执行者（确定版）：

- 由 **Python Worker** 执行清理（理由：本地文件在 Worker 节点上，Worker 也已具备 DB 访问能力用于写库/续跑）。

清理调度（确定建议）：

- Worker 内部定时任务：每 6~24 小时扫描一次到期 job（例如每天凌晨 3 点）
- 每次清理设置单次上限（例如最多清理 100 个 job），避免 IO 峰值

清理粒度与安全规则（确定版）：

1) 默认只删除该 job 的目录：
   - `work/kb/{userId}/{kbPdfId}/pipeline/{jobId}/`
2) 是否删除 `source.pdf` 与上层目录：必须满足“无活跃 job”条件：
   - DB 中不存在同一 `userId+kbPdfId` 且 `status IN ('created','processing','incomplete','failed')` 的 job
   - 且不存在同一 `userId+kbPdfId` 但 `status='completed'` 且 `cleanupAt > now` 的 job（仍在 7 天窗口内）
   - 满足以上条件才允许删除：`work/kb/{userId}/{kbPdfId}/source.pdf` 与空目录

COS 保留策略（本期确定）：

- COS 的 `resultCosPrefix` 目录不清理（保留用于下载与续跑回落）。

清理结果写回（建议）：

- 可在 `note_gen_job` 增加/复用字段记录本地清理成功时间（本期不强制新增字段；若不加字段则只做日志）。

---

## 8. 计费与统计（点数 + token + 上游成本）

> 章节目标：明确“预计点数如何算、实际点数何时扣、失败/续跑如何做到不重复扣费”，并给出 Admin 成本统计的确定口径。

### 8.1 预计点数（Chat 侧展示用，确定版）

原则（固定）：

- 预计点数只用于 UI 展示与“是否允许启动”的前置判断，不参与最终结算。
- 预计点数必须稳定可复现：同一 `kbPdfId + configVersion + pdfEtag` 的估算应一致。

预计点数来源（确定版）：

- 使用 `note_gen_job.pageCount`（来自 `kb_pdf` 或 step1 结果固化到 job）
- 使用 `note_gen_config.configJson` 中的“估算规则”字段（可选；不影响 schemaVersion=1 的兼容性）

建议在 `note_gen_config.configJson` 顶层增加（可选）：

```json
{
  "estimate": {
    "generate-notes": {
      "basePointsMin": 0,
      "basePointsMax": 0,
      "perPagePointsMin": 0,
      "perPagePointsMax": 0
    }
  }
}
```

计算公式（固定）：

- `estimatedCostMinPoints = basePointsMin + pageCount * perPagePointsMin`
- `estimatedCostMaxPoints = basePointsMax + pageCount * perPagePointsMax`
- 若 `estimate.generate-notes` 缺失：两者均为 0（允许上线，但 UI 不展示范围或展示 0~0）

### 8.2 实际扣费（确定版：按 step 成功结算，失败可续跑不重复扣费）

角色分工（与第 6 章对齐，固定）：

- Worker：
  - 负责写 `note_gen_job_step_usage` 的 token/providerCost 等用量事实
  - **不写** `chargedPoints/chargedAt/chargeStatus`
- 99AI-ANKI service：
  - 负责按 admin 现有“模型名称 → 扣费策略”计算点数并扣减用户余额
  - 负责写回 `note_gen_job_step_usage.charge*` 与 `note_gen_job.chargedPoints/chargeStatus`

扣费触发时机（确定版）：

- 每个 step 在写入 `note_gen_job_step_usage.status=success` 后，立刻触发一次“该 step 的扣费尝试”。

扣费幂等原则（确定版）：

- 同一 `jobId + stepNumber` 最多扣费一次。
- 以 DB 字段作为唯一事实：
  - `note_gen_job_step_usage.chargeStatus='charged'` 代表已结算完成，后续重试不得重复扣。

建议增加 Worker → service 的内部扣费触发接口（仅内网/仅 Worker 调用）：

- `POST /internal/note-gen/jobs/:jobId/steps/:stepNumber/charge`
- Auth：使用单独的内部 token（例如 `X-Internal-Worker-Token`），避免复用用户 JWT。

内部扣费接口语义（确定版）：

1) service 在事务内锁定该 job 与该 step_usage（建议 `SELECT ... FOR UPDATE`）
2) 若 step_usage 不存在或 `status != success`：返回 409（表示还不可扣）
3) 若 step_usage `chargeStatus='charged'`：返回 200（幂等成功）
4) 计算 points：完全复用 admin 现有“模型名称 → 扣费策略”与 token 计费口径
5) 检查余额并扣减：
   - 成功：写 step_usage `chargedPoints/chargedAt/chargeStatus='charged'`
   - 并更新 job：
     - `chargedPoints = SUM(step_usage.chargedPoints)`（或增量更新，但必须与事实一致）
     - `chargeStatus = 'charging' | 'charged' | 'partial'`（见 8.3）
   - 余额不足：返回 402（或 409），并进入 8.4 的“点数不足失败流程”

### 8.3 任务级 chargeStatus（确定版：状态含义与写入规则）

`note_gen_job.chargeStatus` 枚举已在第 4 章固定：`not_charged | charging | charged | partial`。

写入规则（确定版）：

- 创建 job：`chargeStatus='not_charged'`，`chargedPoints=0`
- 任意一个 step 完成并成功扣费后：`chargeStatus='charging'`
- 所有本期 steps（`[1,2,3,4,5,8]`）对应的 step_usage 均为 `status=success && chargeStatus='charged'`：
  - `chargeStatus='charged'`
- 若已扣费部分 step，但 job 最终 `status=incomplete|failed`：
  - `chargeStatus='partial'`

> 注：`chargeStatus` 仅描述“本 job 的结算进度”，不改变第 3 章 job 的业务状态机。

### 8.4 点数不足（确定版：如何失败、如何续跑、如何不重复扣费）

触发点（确定版）：

- service 在某个 step 的扣费尝试中判定余额不足。

service 必须做的写库动作（确定版）：

- 将该 job 标记为：
  - `note_gen_job.status='failed'`
  - `note_gen_job.chargeStatus='partial'`（若之前已有扣费）或保持 `not_charged`
  - 写 `lastErrorCode='INSUFFICIENT_POINTS'`、`lastErrorMessage`、`lastErrorAt`

Worker 行为（确定版）：

- 收到“余额不足”响应后：
  - 立即停止后续步骤执行（这不是“用户取消”，属于系统无法继续）
  - 将 job 保持在 `failed`（由 service 写入为准）

续跑规则（确定版）：

- 用户充值后再次发起 `POST /note-gen/jobs`：由于幂等，会返回同一个 job（或 service 允许“对 failed/incomplete job 重新派发”）。
- Worker 续跑时：
  - 已 `status=success` 的 step 依第 6.7 直接跳过
  - 若存在 `status=success` 但 `chargeStatus!='charged'` 的 step_usage：必须先触发补扣费（可在启动时做一次 reconciliation），确保结算与事实一致

### 8.5 Admin 成本统计口径（确定版）

统计事实来源（固定）：`note_gen_job_step_usage`。

- token 统计：
  - `promptTokens/completionTokens/totalTokens` 直接汇总
- 上游成本：
  - `providerCost` 按 stepNumber、modelName 聚合
- 点数统计：
  - `chargedPoints` 以 step_usage 为事实来源聚合到 job（与第 4 章一致）

建议 Admin 报表维度（不要求本期 UI 全实现，但口径固定）：

- 时间：按 `endedAt`（step 结束时间）或 `chargedAt`（扣费完成时间）
- 维度：stepNumber、modelName、provider
- 指标：totalTokens、providerCost、chargedPoints

---

## 9. Admin 端需求（依赖后端数据结构）

> 章节目标：把第 4/5/8 章已经定好的“表结构 + Admin API + 统计口径”落到 Admin UI 的最小闭环：
>
> - 管理员可维护“笔记生成配置”（版本化、可回滚）
> - 管理员可查询任务、定位问题、下载产物、查看用量与成本
>
> 本期不做：管理员手动取消任务、强制重跑、手动清理 COS、本地文件浏览器。

### 9.1 模型管理 → 笔记生成配置（二级目录）

菜单与路由（确定版）：

- 菜单位置：`模型管理` 下新增 children：`笔记生成配置`
- 页面包含 2 个状态：查看当前启用配置 + 编辑并发布新版本

数据来源（确定版，对齐第 5.2.1）：

- 查看：`GET /admin/note-gen/config`
- 发布：`PUT /admin/note-gen/config`

页面字段（确定版）：

- 只读区：
  - `id`、`enabled`（恒为 true）、`version`、`updatedByAdminId`、`updatedAt`
- 编辑区（发布新版本必填）：
  - `name`（必填）
  - `remark`（必填）
  - `configJson`（必填）

UI 形态（最小实现，确定版）：

- `configJson` 使用 JSON 编辑器/大文本框（支持格式化/校验）
- 提交前做前端 JSON 校验 + 后端 schema 校验（不通过则阻止发布）

`configJson` 内容与校验（确定版，对齐第 5.2.1 约束）：

- `configSchemaVersion` 固定为 1（若存在该字段；若不放在 configJson 内，则由 service 固定返回 1）
- 必须包含 `steps`，且至少包含本期 steps：`1,2,3,4,5,8`
- step1/2/4 的 `modelName` 必须是“Admin 模型管理中可用的模型名称”
- step8 本期固定输出两种产物：markmap + word（不提供开关，避免产品面额外分叉）

建议 `steps` 结构（示例，仅用于说明字段名；最终以代码校验为准）：

```json
{
  "steps": {
    "1": { "modelName": "...", "concurrency": 2, "maxRetries": 2, "zoom": 2 },
    "2": { "modelName": "...", "chunkSize": 5, "overlapPages": 1 },
    "3": { "softLimitChars": 12000, "hardLimitChars": 18000 },
    "4": { "modelName": "...", "concurrency": 2, "maxRetries": 2 },
    "5": { },
    "8": { "outputs": { "markdown-markmap": true, "word": true } }
  }
}
```

发布行为（确定版）：

- 每次点击“发布”都会产生新记录（version +1），并将其启用（旧的 enabled=true 会被置为 false）
- 发布成功后刷新页面，显示新的 version

### 9.2 数据管理 → 笔记管理

菜单与路由（确定版）：

- 菜单位置：`数据管理` 下新增 children：`笔记管理`
- 该模块只读（本期不提供“改状态/重跑/清理”等写操作）

数据来源（确定版，对齐第 5.2.2）：

- 列表：`GET /admin/note-gen/jobs`
- 详情：`GET /admin/note-gen/jobs/:jobId`
- 下载：`GET /admin/note-gen/jobs/:jobId/files/:fileType/signed-url`

#### 9.2.1 列表页（确定版）

查询条件（对齐 API，固定）：

- `page`（默认 1）/ `size`（默认 20）
- `status`（可选）
- `userId`（可选）
- `kbPdfId`（可选）
- `jobId`（可选，精确匹配）

默认排序（确定版）：

- `updatedAt` 倒序

列表列（最小闭环，确定版）：

- `jobId`（支持复制）
- `userId`
- `kbPdfId`
- `pipelineKey`（本期应恒为 `generate-notes`，但仍展示便于排错）
- `status`、`progressPercent`
- `chargedPoints`、`chargeStatus`
- `configId`、`configVersion`
- `updatedAt`

列表快捷信息（建议，确定版）：

- 若 job `status in ('incomplete','failed')`：在列表行展示 `lastErrorCode` 的简写标签（不展开堆栈）

行操作（确定版）：

- “查看详情”进入详情页

---

#### 9.2.2 详情页（确定版：审计/排错/下载）

页面区块（确定版）：

1) 任务概览（来自 `job`）：
   - `jobId/userId/kbPdfId/pipelineKey/status/progressPercent`
   - `estimatedCostMinPoints~estimatedCostMaxPoints`、`chargedPoints/chargeStatus/deductType`
   - `createdAt/updatedAt/startedAt/completedAt/cleanupAt`
2) 输入 PDF 快照（来自 `job`）：
   - `pdfCosBucket/pdfCosRegion/pdfCosKey/pdfEtag/pdfSizeBytes/pageCount`
3) 存储状态（来自 `job`）：
   - `resultCosPrefix/cosUploadStatus/cosUploadedAt`
4) 产物列表（来自 `artifacts`）：
   - 列：`type/status/fileName/contentType/sizeBytes/etag/updatedAt`
   - 下载按钮：仅当 `status=ready` 可点；点击后调用 Admin signed-url 接口并打开下载
5) Step 用量明细（来自 `steps`，对齐第 4.3）：
   - 列：`stepNumber/status/startedAt/endedAt/modelName/provider/totalTokens/providerCost/chargeStatus/chargedPoints/chargedAt/errorMessage`
6) 错误信息（来自 `job.lastError*`）：
   - `lastErrorCode/lastErrorMessage/lastErrorAt`
   - `lastErrorStack` 仅在详情页展开显示（避免列表污染）

统计展示口径（确定版，对齐第 8.5）：

- token：详情页可显示 job 级汇总（sum steps.totalTokens），并在 steps 表格中保留分步
- providerCost：同上
- chargedPoints：以 step_usage 的 chargedPoints 汇总结果为准（与 job 字段一致）

权限（确定版）：

- 全部 Admin 页面与 API 使用 `AdminAuthGuard`
- Admin 下载不校验 owner，仅校验 artifact 存在且 `status=ready`（对齐第 5.2.2）

## 10. Chat 端需求（最后写 UI，因为依赖 API/状态机/计费字段）

> 章节目标：在不新增“取消/页范围/模型选择”等非目标能力的前提下，把 Chat 内的“选择 KB PDF → 创建任务 → 轮询进度 → 下载交付/失败续跑”闭环写成可直接实现的确定版。

### 10.1 入口与按钮

- 位置：Chat Footer，按钮样式与现有 pill 按钮一致
- icon：准备一个小图标（与现有 icon 库风格保持一致）
- 交互：
  - 点击选中 → 进入“生成笔记”模式
  - 再次点击取消 → 回到普通聊天
  - **选中后左上角默认不选模型，与左上角模型无关**（本功能不使用 chat 的模型选择）

按钮文案与状态（确定版）：

- 文案：`生成笔记`
- 选中态：高亮（与现有 pill 一致）
- 未选中态：不显示任何额外 UI

### 10.2 参数选择

必选输入（确定版）：

- `kbPdfId`：知识库中的一个 PDF 文档
- `pageRange`：本期不可修改，固定 `{ mode: 'all' }`（UI 不展示可编辑项）

交互（确定版，最小可实现）：

- 进入“生成笔记”模式后，在输入框区域展示：
  - “选择 PDF”控件（复用现有 KB PDF 选择器/列表组件；若没有则用下拉选择，不新增复杂弹窗）
  - 已选中时显示：`已选择：{pdfDisplayName}` + `更换`
- 未选择 PDF 时，发送按钮仍可点，但点击发送必须阻止提交并提示：`请选择一个知识库 PDF`。

### 10.3 提交与等待

提交动作（确定版）：

- 用户点击发送（或等价的“开始生成”）：调用创建任务接口：
  - `POST /note-gen/jobs`，body：`{ kbPdfId, pageRange: { mode: 'all' }, configSnapshotId?: number }`
- 创建成功后，在当前对话流中插入一条“任务卡片消息”（不需要另开页面）：
  - 展示 `jobId`（可复制）
  - 展示当前 `status/progressPercent`
  - 展示点数：`chargedPoints` 与 `estimatedCostPoints.min~max`

等待/轮询（确定版，对齐第 2.2 与第 5.1.2）：

- 创建成功后立即拉一次详情：`GET /note-gen/jobs/:jobId`
- 自动刷新：每 60 秒拉一次（用户在该会话内/切换对话仍可继续轮询；退出页面后由用户下次进入再刷新）
- 手动刷新：任务卡片内提供“刷新”按钮，点击立刻拉一次 `GET /note-gen/jobs/:jobId`

等待界面必须包含（确定版）：

- 6 段进度条（显示 0~100 的数字百分比；不展示步骤名）
- 提示文案（固定）：`你可以做其他事，任务完成后可回来下载。`
- 点数信息：
  - `已消耗：{chargedPoints} 点`
  - `预计消耗：{min}~{max} 点`（若两者为 0，可隐藏预计区）

严格禁止（确定版）：

- 不提供“取消/中断”按钮
- 不展示 signed-url（避免轮询导致 URL 过期/浪费）

### 10.4 失败处理

状态展示（确定版，对齐第 5.1.2 的 `userMessage`）：

- `status=failed`：展示接口返回的固定文案（强调可续跑与不浪费）
- `status=incomplete`：展示接口返回的固定文案（强调可续跑与不重复扣费）

操作按钮（确定版）：

- 在 `failed/incomplete` 的任务卡片上显示：`继续生成` 按钮
- 点击 `继续生成`：再次调用 `POST /note-gen/jobs`（同一个 `kbPdfId`，同一个 pageRange，使用当前启用配置或用户当时选择的 configSnapshotId）
  - 由于第 5.1.1 的幂等规则，通常会返回同一个 jobId；若 service 选择返回新的 jobId，也必须更新卡片绑定到新 jobId

错误信息边界（确定版）：

- Chat 不展示 `lastErrorStack` 等敏感/冗长错误，仅展示 `userMessage`
- 具体排错由 Admin 端查看（第 9 章）

### 10.5 完成后交付

完成判定（确定版）：

- 仅当 `GET /note-gen/jobs/:jobId` 返回：
  - `status=completed`
  - 且 `resultFiles` 至少包含两条（`markdown-markmap` 与 `word` 且均 `status=ready`）
  - 才展示“下载区”。

下载区 UI（确定版）：

- 两张文件卡片（从 `resultFiles` 渲染，不硬编码）：
  - `type=markdown-markmap`：显示 `fileName/sizeBytes/updatedAt`
  - `type=word`：显示 `fileName/sizeBytes/updatedAt`

下载动作（确定版，对齐第 5.1.3）：

- 点击文件卡片：调用 `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`
- 拿到 `{ url, expiresAt }` 后立即触发浏览器下载（新开窗口或直接跳转均可）
- 若下载失败或 URL 过期：允许用户再次点击重新获取 signed-url（不缓存 URL）

并发/状态边界（确定版）：

- 若接口返回 409（artifact `uploading`）：提示 `文件正在上传，请稍后重试`，不重试循环

---

## 11. 交付清单（本期）

本期交付以“可用闭环”为准：用户能从 Chat 发起任务、看到进度、拿到两份下载产物；管理员能配置与排错；失败可续跑且不重复扣费。

- 后端（99AI-ANKI service）：
  - 数据表与索引：`note_gen_config`、`note_gen_job`、`note_gen_job_step_usage`、`note_gen_job_artifact`（对齐第 4 章）
  - Chat API（对齐第 5.1）：
    - `POST /note-gen/jobs`
    - `GET /note-gen/jobs/:jobId`
    - `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`
  - Admin API（对齐第 5.2）：
    - `GET/PUT /admin/note-gen/config`
    - `GET /admin/note-gen/jobs`、`GET /admin/note-gen/jobs/:jobId`
    - `GET /admin/note-gen/jobs/:jobId/files/:fileType/signed-url`
  - 扣费与幂等（对齐第 8 章）：
    - step 级结算幂等（`jobId+stepNumber`）
    - 任务级 `chargedPoints/chargeStatus` 维护
    - 点数不足时将 job 置为 `failed` 且可续跑
  - COS 签名下载：过期秒数复用 `kbCosSignedUrlExpiresSeconds`（默认 60 秒）

- Worker（Python 3.11）：
  - Worker API（对齐第 6.3）：
    - `GET /api/pdf-note/health`
    - `POST /api/pdf-note/generate-notes`
  - 流水线能力：仅 `generate-notes`，steps 严格 `[1,2,3,4,5,8]`
  - 本地目录与断点续跑：`work/kb/{userId}/{kbPdfId}/pipeline/{jobId}`（对齐第 6.5 与第 7 章）
  - 存储与上传：写 `resultCosPrefix` 目录，最终产物两份必须可下载（对齐第 7.2/7.3）
  - 写库：进度（6 段）、step_usage 用量事实、artifact 产物记录（对齐第 6 章）
  - 7 天清理：按 `cleanupAt` 清理本地 `pipeline/{jobId}`（对齐第 7.4）

- Admin（99AI-ANKI/admin）：
  - `模型管理 → 笔记生成配置`：查看当前启用配置 + 发布新版本（对齐第 9.1）
  - `数据管理 → 笔记管理`：列表/详情/下载/排错（对齐第 9.2）

- Chat（99AI-ANKI/chat）：
  - Chat Footer 增加 `生成笔记` pill 按钮（对齐第 10.1）
  - 选择 KB PDF → 创建任务 → 轮询进度（60 秒自动 + 手动刷新）（对齐第 10.2~10.3）
  - 完成后两份文件卡片下载（签名 URL 单独接口）（对齐第 10.5）
  - `failed/incomplete` 提示与“继续生成”（幂等续跑）（对齐第 10.4）

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
