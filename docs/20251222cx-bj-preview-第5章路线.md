# 20251222cx-bj-preview：第 5 章（API 设计）开发路线（详细增量 Steps）

> 目标：严格落地 `20251221cx-bj-preview.md` 的第 5 章 API 契约（Chat + Admin）。
>
> 范围约束：仅“生成笔记（generate-notes）”对应的 API；不做功能 2/3；不提供取消接口；`pageRange` 仅允许 `{ mode: 'all' }`。
>
> 依赖前置：第 4 章四张表（`note_gen_config / note_gen_job / note_gen_job_step_usage / note_gen_job_artifact`）已完成迁移并可读写；`kb_pdf` 表已存在并包含 COS 字段。

---

## 0. 本路线统一约定（所有 Step 复用）

### 0.1 本地启动与环境变量

- 运行 service：在 `99AI-ANKI/service` 下按现有方式启动（开发/测试环境任选）。
- 下面所有 curl 示例使用：
  - `BASE_URL`：服务地址，例如 `http://127.0.0.1:7001`
  - `JWT`：普通用户登录后的 token
  - `ADMIN_JWT`：管理员 token（`AdminAuthGuard` 通过）

Windows CMD 可这样设置：

```bat
set BASE_URL=http://127.0.0.1:7001
set JWT=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImYwY2IxNjVlYiIsImlkIjoyLCJlbWFpbCI6IjExMzI2NTAxMDhAcXEuY29tIiwicm9sZSI6InZpZXdlciIsIm9wZW5JZCI6IiIsImNsaWVudCI6bnVsbCwicGhvbmUiOm51bGwsImlhdCI6MTc2NjM5MzY0NiwiZXhwIjoxNzY2OTk4NDQ2fQ.UxzsgKqNnr7PymSXWkA-zwRtXLfbWC6PqOEncMwZHoo
set ADMIN_JWT=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InN1cGVyY3giLCJpZCI6MSwiZW1haWwiOiJzdXBlcmN4Iiwicm9sZSI6InN1cGVyIiwib3BlbklkIjoiIiwiY2xpZW50IjpudWxsLCJwaG9uZSI6bnVsbCwiaWF0IjoxNzY2MzkzMjA4LCJleHAiOjE3NjY5OTgwMDh9.BR0mgg3O2lC9DybCjYGdL8G5eXNCzVYKtqBn9P2bTyY
```

一行命令获取 `JWT`（登录接口直接返回 token 字符串）：

```bat
curl -s -X POST "%BASE_URL%/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}"
```

一行命令获取 `userId`（从 `/auth/getInfo` 返回中提取；兼容不同返回结构）：

```bat
curl -s "%BASE_URL%/auth/getInfo" -H "Authorization: Bearer %JWT%" | python -c "import sys,json; j=json.load(sys.stdin); u=(j.get('userInfo') or j.get('data',{}).get('userInfo',{})); print(u.get('id'))"
```

说明：`ADMIN_JWT` 的获取方式相同，只要用管理员账号调用上面的登录命令即可（其 token 的 payload 里 `role` 为 `admin` 或 `super` 才能通过 `AdminAuthGuard`）。

### 0.2 认证 Header

- 普通用户：`Authorization: Bearer <JWT>`
- 管理员：`Authorization: Bearer <ADMIN_JWT>`

### 0.3 签名 URL 返回结构

- 所有签名 URL 接口统一返回：`{ "url": string, "expiresAt": number }`
- `expiresAt` 为 Unix 秒。
- 签名过期秒数复用知识库配置：`kbCosSignedUrlExpiresSeconds`（默认 600），参考现有 `GET /kb/files/:id/signed-url`。

---

## Step 1 — 新增 NoteGen 模块骨架（可编译可启动）

### 目标（可运行的原子任务）

- 新增 `note-gen` 模块骨架（Module + Controller + Service），并让服务可正常启动。

### 修改代码（新增/修改哪些）

- 新增：`99AI-ANKI/service/src/modules/noteGen/noteGen.module.ts`
- 新增：`99AI-ANKI/service/src/modules/noteGen/noteGen.service.ts`
- 新增：`99AI-ANKI/service/src/modules/noteGen/noteGen.controller.ts`（Chat 侧前缀 `/note-gen`，仅占位）
- 新增：`99AI-ANKI/service/src/modules/noteGen/adminNoteGen.controller.ts`（Admin 侧前缀 `/admin/note-gen`，仅占位）
- 修改：`99AI-ANKI/service/src/app.module.ts` 引入 `NoteGenModule`

### 验证脚本（curl）

1) 先验证服务存活（用现有接口即可，例如 KB quota）：

```bat
curl -s "%BASE_URL%/kb/quota" -H "Authorization: Bearer %JWT%"
```

2) 模块接入确认：建议在开发期提供一个最小 `GET /note-gen/health`（不在最终对外契约内，后续可删）：

```bat
curl -i "%BASE_URL%/note-gen/health"
```

期望：HTTP 200，body `{ "status": "ok" }`。

### 完成状态（2025-12-22）

- **已实现模块骨架**：新增并接入 `NoteGenModule`，包含最小的 Chat/Admin controller 与 service，提供 `GET /note-gen/health` 与 `GET /admin/note-gen/health` 用于本地联调。
- **新增文件（4 个）**：[service/src/modules/noteGen/noteGen.module.ts](service/src/modules/noteGen/noteGen.module.ts)、[service/src/modules/noteGen/noteGen.service.ts](service/src/modules/noteGen/noteGen.service.ts)、[service/src/modules/noteGen/noteGen.controller.ts](service/src/modules/noteGen/noteGen.controller.ts)、[service/src/modules/noteGen/adminNoteGen.controller.ts](service/src/modules/noteGen/adminNoteGen.controller.ts)。
- **修改文件（1 个）**：[service/src/app.module.ts](service/src/app.module.ts)（引入并注册 `NoteGenModule`）。


### 回滚策略

- 立即回滚：从 `AppModule` 移除 `NoteGenModule` import，重启 service。

---

## Step 2 — 定义枚举与 DTO，并把输入校验“锁死”到第 5 章

### 目标

- 落地第 5 章固定枚举与 DTO 结构。
- 确保 `pageRange.mode != all` 直接 400。

### 修改代码

- 新增：`99AI-ANKI/service/src/modules/noteGen/noteGen.types.ts`（放 `NoteGenJobStatus/ChargeStatus/ArtifactType/ArtifactStatus`）
- 新增：`99AI-ANKI/service/src/modules/noteGen/dto/createNoteGenJob.dto.ts`
- 新增：`99AI-ANKI/service/src/modules/noteGen/dto/noteGenJobDetail.dto.ts`
- 新增：`99AI-ANKI/service/src/modules/noteGen/dto/adminUpdateNoteGenConfig.dto.ts`
- 新增：`99AI-ANKI/service/src/modules/noteGen/dto/adminQueryNoteGenJobs.dto.ts`
- 新增：`99AI-ANKI/service/src/modules/noteGen/dto/adminNoteGenJobList.dto.ts`
- 修改：`noteGen.controller.ts` / `adminNoteGen.controller.ts`：
  - Chat 使用 `JwtAuthGuard`
  - Admin 使用 `AdminAuthGuard`
  - DTO 用 `class-validator` 做参数校验（项目已启用全局 `ValidationPipe`）

### 验证脚本

1) 未带 token 应返回 401（Chat 侧）：

```bat
curl -i "%BASE_URL%/note-gen/jobs/00000000-0000-0000-0000-000000000000"
```

2) `pageRange.mode` 非 all 必须 400：

```bat
curl -i -X POST "%BASE_URL%/note-gen/jobs" ^
	-H "Authorization: Bearer %JWT%" ^
	-H "Content-Type: application/json" ^
	-d "{\"kbPdfId\":1,\"pageRange\":{\"mode\":\"range\",\"start\":1,\"end\":2}}"
```

期望：HTTP 400。

### 回滚策略

- 仅 DTO/校验变更：回滚相关提交即可，不影响数据库。

---

## Step 3 — 实现 Chat：创建任务 `POST /note-gen/jobs`（含幂等键；先不触发 worker）

### 目标

- 实现第 5.1.1：创建生成笔记任务（幂等返回同一 job）。
- 本 Step 仅保证“创建成功 + 可查询”，暂不触发 worker 执行（第 6 章再接）。

### 修改代码

- 新增（或按现有实体组织方式新增）：
  - `99AI-ANKI/service/src/modules/noteGen/entities/noteGenConfig.entity.ts`
  - `99AI-ANKI/service/src/modules/noteGen/entities/noteGenJob.entity.ts`
  - `99AI-ANKI/service/src/modules/noteGen/entities/noteGenJobStepUsage.entity.ts`
  - `99AI-ANKI/service/src/modules/noteGen/entities/noteGenJobArtifact.entity.ts`
- 修改：`noteGen.module.ts` 注入 TypeORM repositories
- 修改：`noteGen.service.ts`
  - 校验 `kbPdfId` 属于当前用户
  - 读取 `kb_pdf` 的 `cosBucket/cosRegion/cosKey/etag/sizeBytes/pageCount` 并冗余固化到 job
  - 获取 config：
    - 传 `configSnapshotId`：取指定 config
    - 不传：取 `enabled=true` 的 config
  - 计算 `idempotencyKey = sha256(userId + kbPdfId + pipelineKey + pageRange + configId + configVersion + pdfEtag)`
  - `userId + idempotencyKey` 已存在：直接返回该 job
  - 否则创建 job：
    - `pipelineKey = generate-notes`
    - `stepsJson = [1,2,3,4,5,8]`
    - `pageRangeJson = { mode: 'all' }`
    - `status = created, progressPercent = 0`
    - `chargeStatus = not_charged, chargedPoints = 0`
    - `resultCosPrefix` 写入稳定前缀（例如 `kb/note-gen/<userId>/<kbPdfId>/<jobId>/`）
- 修改：`noteGen.controller.ts` 补齐 `POST /note-gen/jobs`

### 验证脚本

1) 创建任务：

```bat
curl -s -X POST "%BASE_URL%/note-gen/jobs" ^
	-H "Authorization: Bearer %JWT%" ^
	-H "Content-Type: application/json" ^
	-d "{\"kbPdfId\":1,\"pageRange\":{\"mode\":\"all\"}}"
```

期望：返回包含 `jobId/status/progressPercent/estimatedCostPoints/chargeStatus`。

2) 幂等验证：重复发同一请求应返回同一个 `jobId`。

### 回滚策略（关键）

- 临时止血：Controller 层直接返回 503（避免继续写入脏数据）。
- 开发期数据清理：按 `pipelineKey=generate-notes` 且 `status=created` 的 job 批量删除。

---

## Step 4 — 实现 Chat：查询任务 `GET /note-gen/jobs/:jobId`（不返回 signed-url）

### 目标

- 实现第 5.1.2：轮询任务详情，仅返回进度/点数/状态/结果文件列表，不含 URL。

### 修改代码

- 修改：`noteGen.service.ts`
  - 通过 `jobId` + `userId` 查询 job；不存在返回 404
  - `userMessage` 规则：
    - `failed` 固定文案
    - `incomplete` 固定文案
  - `resultFiles` 规则：
    - 仅当 `status=completed` 且 artifact `status=ready` 才返回
- 修改：`noteGen.controller.ts` 增加 `GET /note-gen/jobs/:jobId`

### 验证脚本

```bat
curl -s "%BASE_URL%/note-gen/jobs/<JOB_ID>" -H "Authorization: Bearer %JWT%"
```

期望：

- `status` 为 `created`（或后续 worker 执行变为 `processing/completed`）
- 不包含 `url` 字段

### 回滚策略

- 只读接口：撤销路由即可。

---

## Step 5 — 实现 Chat：下载签名 `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`

### 目标

- 实现第 5.1.3：用户点击下载时获取短期 signed-url。
- 复用 KB 的 COS 签名实现与过期配置。

### 修改代码

- 修改：`noteGen.service.ts`
  - 校验 job 属于当前用户
  - 校验 `job.status == completed`
  - 校验 artifact 存在且 `status=ready`
  - 复用 KB 的签名配置 `kbCosSignedUrlExpiresSeconds`
- 建议新增复用工具，避免复制 KB 代码：
  - 新增：`99AI-ANKI/service/src/common/cos/cosSigner.ts`（或在 `KbService` 中抽出 `signCosObjectUrl(...)`）

### 验证脚本

```bat
curl -i "%BASE_URL%/note-gen/jobs/<JOB_ID>/files/word/signed-url" -H "Authorization: Bearer %JWT%"
```

完成后：

```bat
curl -s "%BASE_URL%/note-gen/jobs/<JOB_ID>/files/markdown-markmap/signed-url" -H "Authorization: Bearer %JWT%"
```

### 回滚策略（关键）

- 立即回滚：接口返回 503，防止错误签名导致误下载/风险扩大。
- 若抽取公共 signer 影响 KB：优先回滚抽取，恢复 KB 原实现。

---

## Step 6 — Admin：实现 `GET /admin/note-gen/config`（读取当前启用配置）

### 目标

- 实现第 5.2.1 GET：返回 `enabled=true` 的那条 config。

### 修改代码

- 修改：`adminNoteGen.controller.ts` 增加 `GET /admin/note-gen/config`
- 修改：`noteGen.service.ts`（或拆 `adminNoteGen.service.ts`）提供读取方法
- 若系统可能不存在任何 config：
  - 方案 A：提供一次性 seed（仅初始化脚本/管理端按钮）
  - 方案 B：明确要求 DBA 先插入一条默认配置

### 验证脚本

```bat
curl -s "%BASE_URL%/admin/note-gen/config" -H "Authorization: Bearer %ADMIN_JWT%"
```

### 回滚策略

- 只读接口：撤销路由即可。

---

## Step 7 — Admin：实现 `PUT /admin/note-gen/config`（版本递增 + 单一 enabled）

### 目标

- 实现第 5.2.1 PUT：每次更新创建新记录、旧记录置 `enabled=false`，版本号 +1。
- 校验：Step 1/2/4 的 `modelName` 必须是 Admin 模型管理中可用模型名。

### 修改代码

- 修改：`adminNoteGen.controller.ts` 增加 `PUT /admin/note-gen/config`
- 修改：`noteGen.service.ts`
  - transaction：写新 config + 关闭旧 enabled config
  - 校验 `configSchemaVersion == 1`、`steps` 字段完整
  - 校验模型名：调用 `ModelsService`（或直接查 models 表）

### 验证脚本

```bat
curl -s -X PUT "%BASE_URL%/admin/note-gen/config" ^
	-H "Authorization: Bearer %ADMIN_JWT%" ^
	-H "Content-Type: application/json" ^
	-d "{\"name\":\"default\",\"remark\":\"init\",\"configJson\":{\"configSchemaVersion\":1,\"steps\":{\"1\":{\"modelName\":\"gpt-4o-mini\",\"concurrency\":1,\"maxRetries\":2,\"zoom\":2.0},\"2\":{\"modelName\":\"gpt-4o-mini\",\"chunkSize\":8,\"overlapPages\":1},\"3\":{\"softLimitChars\":12000,\"hardLimitChars\":16000},\"4\":{\"modelName\":\"gpt-4o-mini\",\"concurrency\":1,\"maxRetries\":2},\"5\":{\"reserved\":true},\"8\":{\"outputs\":{\"markdownMarkmap\":true,\"word\":true}}}}}"
```

### 回滚策略（关键）

- 配置写坏导致创建 job 失败：
  - 快速回滚：把上一条配置重新 PUT 一次（会生成新版本但语义恢复）
  - 或紧急 DB 操作：上一条 `enabled=true`、当前条 `enabled=false`

---

## Step 8 — Admin：实现任务列表 `GET /admin/note-gen/jobs`（分页 + 过滤）

### 目标

- 实现第 5.2.2 列表：分页、过滤（status/userId/kbPdfId/jobId）。

### 修改代码

- 修改：`adminNoteGen.controller.ts` 增加 `GET /admin/note-gen/jobs`
- 修改：`noteGen.service.ts` 增加 list 查询（`findAndCount + skip/take`）

### 验证脚本

```bat
curl -s "%BASE_URL%/admin/note-gen/jobs?page=1&size=20" -H "Authorization: Bearer %ADMIN_JWT%"
```

### 回滚策略

- 只读接口：撤销路由即可。

---

## Step 9 — Admin：实现任务详情 `GET /admin/note-gen/jobs/:jobId`（job + steps + artifacts）

### 目标

- 实现第 5.2.2 详情：返回 job + steps + artifacts。

### 修改代码

- 修改：`adminNoteGen.controller.ts` 增加 `GET /admin/note-gen/jobs/:jobId`
- 修改：`noteGen.service.ts` 联表查询：
  - `note_gen_job`
  - `note_gen_job_step_usage`
  - `note_gen_job_artifact`

### 验证脚本

```bat
curl -s "%BASE_URL%/admin/note-gen/jobs/<JOB_ID>" -H "Authorization: Bearer %ADMIN_JWT%"
```

### 回滚策略

- 只读接口：撤销路由即可。

---

## Step 10 — Admin：下载签名 `GET /admin/note-gen/jobs/:jobId/files/:fileType/signed-url`

### 目标

- 实现第 5.2.2 Admin 下载：不校验 owner，仅校验 artifact ready。

### 修改代码

- 修改：`adminNoteGen.controller.ts` 增加下载路由
- 修改：`noteGen.service.ts` 增加 admin 下载逻辑（复用 signer）

### 验证脚本

```bat
curl -s "%BASE_URL%/admin/note-gen/jobs/<JOB_ID>/files/word/signed-url" -H "Authorization: Bearer %ADMIN_JWT%"
```

### 回滚策略（关键）

- 出现风险：立即让该接口返回 503，并保留 Chat 侧 owner 校验接口。

---

## Step 11 —（可选但建议）补齐 Swagger 与错误码一致性

### 目标

- 与现有模块保持一致：加 `@ApiTags/@ApiOperation/@ApiBearerAuth`。
- 固化常见错误场景 HTTP code：
  - 400：参数非法 / jobId 非法 / fileType 非法
  - 401：未登录
  - 404：不存在或无权限
  - 409：artifact uploading
  - 500：COS 字段缺失 / 签名失败

### 修改代码

- 修改：`noteGen.controller.ts`、`adminNoteGen.controller.ts`

### 验证脚本

- 打开 swagger（若项目已启用 swagger UI），人工核对 schema 与响应。

### 回滚策略

- 仅装饰器/文档变更：回滚无风险。

---

## Step 12 — 第 5 章 API 验收清单（交付口径）

当以下接口全部可用并通过 curl 验证，即可认为“第 5 章 API”完成：

- Chat
  - `POST /note-gen/jobs`
  - `GET /note-gen/jobs/:jobId`
  - `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`
- Admin
  - `GET /admin/note-gen/config`
  - `PUT /admin/note-gen/config`
  - `GET /admin/note-gen/jobs`
  - `GET /admin/note-gen/jobs/:jobId`
  - `GET /admin/note-gen/jobs/:jobId/files/:fileType/signed-url`

> 下一章（第 6 章 worker）接入后，Step 4/5 的 `status/progressPercent/resultFiles` 会自动从 `created/processing` 进入 `completed`，并出现 `markdown-markmap/word` 两条可下载记录。
