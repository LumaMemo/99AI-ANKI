# 99AI-ANKI：第5章（API 设计）开发路线步骤

> 文档说明：本路线基于 `99AI-ANKI\docs\20251221cx-bj-preview.md` 方案，将第5章的 API 开发拆分为 6 个增量、可运行的原子步骤。
> 
> 目标：实现 Chat 侧与 Admin 侧的笔记生成任务管理能力。

---

## 执行记录

### Step 1: 基础架构与模块注册 (2025-12-22)
- **完成内容**：
  - 定义了 `NoteGenJobStatus` 等核心类型于 `noteGen.types.ts`。
  - 填充了 `CreateNoteGenJobDto`、`AdminUpdateNoteGenConfigDto` 等 DTO。
  - 创建了 `NoteGenService` 骨架，注入了 4 个核心 Entity Repository。
  - 创建了 `NoteGenController` (Chat) 和 `AdminNoteGenController` (Admin)，并配置了相应的路由与 Guard。
  - 在 `AppModule` 中成功注册 `NoteGenModule`。
- **验证结果**：接口已挂载，受 JWT 保护，返回 `Not implemented` 占位信息。

### Step 2: 管理端配置管理 (Admin) (2025-12-22)
- **完成内容**：
  - 在 `NoteGenService` 中实现了 `getActiveConfig` 和 `updateConfig`。
  - `updateConfig` 采用版本化策略：禁用旧配置，插入新配置并递增 `version`。
  - 在 `AdminNoteGenController` 中实现了 `GET /admin/note-gen/config` 和 `PUT /admin/note-gen/config`。
  - 引入了 `express` 的 `Request` 类型以获取当前操作管理员 ID。
- **验证结果**：可通过 Admin JWT 成功创建并查询配置，数据库中 `version` 字段按预期递增。

### Step 3: 任务创建与幂等 (Chat) (2025-12-22)
- **完成内容**：
  - 在 `NoteGenModule` 中注册了 `KbPdfEntity`。
  - 在 `NoteGenService` 中实现了 `createJob` 逻辑，包含权限校验、配置快照固化和基于 SHA256 的幂等校验。
  - 在 `NoteGenController` 中开放了 `POST /jobs` 接口。
- **验证结果**：首次请求成功创建 Job 并返回 UUID，重复请求返回相同的 Job 对象，符合幂等预期。

---

## 开发路线概览

| 步骤 | 任务名称 | 核心内容 | 验证点 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **Step 1** | 基础架构与模块注册 | 创建 Module/Service/Controller 骨架并注册 | 接口返回 404 -> 200/401 | ✅ 已完成 |
| **Step 2** | 管理端配置管理 (Admin) | 实现配置的 GET/PUT，支持版本化快照 | 配置持久化与版本递增 | ✅ 已完成 |
| **Step 3** | 任务创建与幂等 (Chat) | 实现 `POST /note-gen/jobs`，计算幂等键 | 重复请求返回相同 jobId | ✅ 已完成 |
| **Step 4** | 任务详情与进度 (Chat) | 实现 `GET /note-gen/jobs/:jobId` | 轮询获取状态与进度 | ⏳ 待开始 |
| **Step 5** | 产物下载签名 (Shared) | 实现 Chat/Admin 的 COS 签名下载接口 | 获取可访问的签名 URL |
| **Step 6** | 任务审计与管理 (Admin) | 实现管理端列表分页与详情查询 | 管理端全量数据审计 |

---

## Step 1: 基础架构与模块注册

### 修改代码
1. **创建文件**：
   - `service/src/modules/noteGen/noteGen.module.ts`
   - `service/src/modules/noteGen/noteGen.service.ts`
   - `service/src/modules/noteGen/noteGen.controller.ts` (Chat 侧)
   - `service/src/modules/noteGen/adminNoteGen.controller.ts` (Admin 侧)
2. **注册模块**：
   - 在 `service/src/app.module.ts` 的 `imports` 数组中添加 `NoteGenModule`。
3. **定义 DTO**：
   - 填充 `service/src/modules/noteGen/dto/` 下的空文件。

### 验证脚本
```bash
# 验证 Chat 接口（应返回 401 Unauthorized，证明路由已挂载且受 JWT 保护）
# 注意：99AI 后端所有 API 路由均带有 /api 前缀
curl -X GET http://localhost:9520/api/note-gen/jobs/test-id

# 验证 Admin 接口（应返回 401 Unauthorized）
curl -X GET http://localhost:9520/api/admin/note-gen/config
```

### 回滚策略
- 从 `app.module.ts` 移除 `NoteGenModule` 导入。
- 删除 `noteGen` 目录下新创建的 controller/service/module 文件。

---

## Step 2: 管理端配置管理 (Admin)

### 修改代码
1. **NoteGenService**：实现 `getActiveConfig()` 和 `updateConfig()`。
   - `updateConfig` 逻辑：将旧配置 `enabled` 置为 0，插入新记录 `version = old.version + 1`, `enabled = 1`。
2. **AdminNoteGenController**：
   - `GET /admin/note-gen/config`
   - `PUT /admin/note-gen/config`

### 验证脚本
```bash
# 1. 获取当前配置
curl -X GET http://localhost:9520/api/admin/note-gen/config \
  -H "Authorization: Bearer <ADMIN_JWT>"

# 2. 更新配置
curl -X PUT http://localhost:9520/api/admin/note-gen/config \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "默认生产配置",
    "remark": "初始化配置",
    "configJson": { "steps": { "1": {"modelName": "gpt-4o-mini"}, "2": {}, "3": {}, "4": {}, "5": {}, "8": {} } }
  }'
```

### 回滚策略
- 数据库执行：`UPDATE note_gen_config SET enabled = 0 WHERE version = N; UPDATE note_gen_config SET enabled = 1 WHERE version = N-1;`

---

## Step 3: 任务创建与幂等 (Chat)

### 修改代码
1. **NoteGenService**：实现 `createJob()`。
   - 校验 `kbPdfId` 是否属于当前用户。
   - 计算 `idempotencyKey` (sha256 of userId + kbPdfId + configId + configVersion + pdfEtag)。
   - 检查是否存在相同幂等键的 Job，存在则直接返回。
   - 固化 `configSnapshotJson`。
2. **NoteGenController**：`POST /note-gen/jobs`。

### 验证脚本
```bash
# 创建任务 (假设 kbPdfId 为 5)
curl -X POST http://localhost:9520/api/note-gen/jobs \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "kbPdfId": 5, "pageRange": { "mode": "all" } }'

# 再次请求（验证幂等性，应返回相同的 jobId）
```

---

## Step 4: 任务详情与进度 (Chat)

### 修改代码
1. **NoteGenService**：实现 `getJobDetail()`。
   - 关联查询 `note_gen_job` 和 `note_gen_job_artifact`。
   - 仅当 `status=completed` 时返回 `resultFiles`。
2. **NoteGenController**：`GET /note-gen/jobs/:jobId`。

### 验证脚本
```bash
# 查询任务详情
curl -X GET http://localhost:9520/api/note-gen/jobs/<JOB_ID> \
  -H "Authorization: Bearer <USER_JWT>"
```

---

## Step 5: 产物下载签名 (Shared)

### 修改代码
1. **NoteGenService**：实现 `getArtifactSignedUrl()`。
   - 调用 `KbService` 或 `UploadService` 中的 COS 签名方法。
   - 校验 Job 归属权（Chat 侧）或 Admin 权限。
2. **NoteGenController** & **AdminNoteGenController**：
   - `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`
   - `GET /admin/note-gen/jobs/:jobId/files/:fileType/signed-url`

### 验证脚本
```bash
# 获取签名 URL
curl -X GET http://localhost:9520/api/note-gen/jobs/<JOB_ID>/files/markdown-markmap/signed-url \
  -H "Authorization: Bearer <USER_JWT>"
```

---

## Step 6: 任务审计与管理 (Admin)

### 修改代码
1. **NoteGenService**：实现 `adminListJobs()` 和 `adminGetJobDetail()`。
   - `adminGetJobDetail` 需包含 `step_usage` 明细。
2. **AdminNoteGenController**：
   - `GET /admin/note-gen/jobs` (分页/筛选)
   - `GET /admin/note-gen/jobs/:jobId`

### 验证脚本
```bash
# 管理端查看所有任务
curl -X GET "http://localhost:9520/api/admin/note-gen/jobs?page=1&size=10" \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

---

## 附录：测试凭据

- **User JWT**: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImYwY2IxNjVlYiIsImlkIjoyLCJlbWFpbCI6IjExMzI2NTAxMDhAcXEuY29tIiwicm9sZSI6InZpZXdlciIsIm9wZW5JZCI6IiIsImNsaWVudCI6bnVsbCwicGhvbmUiOm51bGwsImlhdCI6MTc2NjQwNDcyOSwiZXhwIjoxNzY3MDA5NTI5fQ.TYXMQOOd5hzNjR6XT6kMYOwE1xG1Rio8-G0i0LVt6JA`
- **Admin JWT**: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InN1cGVyY3giLCJpZCI6MSwiZW1haWwiOiJzdXBlcmN4Iiwicm9sZSI6InN1cGVyIiwib3BlbklkIjoiIiwiY2xpZW50IjpudWxsLCJwaG9uZSI6bnVsbCwiaWF0IjoxNzY2NDA3Mjc3LCJleHAiOjE3NjcwMTIwNzd9.dq3pPb-qig2BaYti7Fa48RKO12RwkX0RRh82pC2cOgs`
