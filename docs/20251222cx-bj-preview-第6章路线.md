# 99AI-ANKI：第6章（Worker 实现与集成）开发路线步骤

> 文档说明：本路线基于 `99AI-ANKI\docs\20251221cx-bj-preview.md` 方案与 `pdf_to_anki\docs\20251221cx步骤流程.md`，将第6章的 Worker 实现与后端集成拆分为 7 个增量、可运行的原子步骤。
> 
> 目标：实现 Python Worker 的异步处理能力，并与 NestJS 后端完成状态同步与闭环。

---

## 开发路线概览

| 步骤 | 任务名称 | 核心内容 | 验证点 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **Step 1** | Worker 基础架构与鉴权 | 实现 `X-Worker-Token` 校验与健康检查 | 401 -> 200 | ✅ 已完成 |
| **Step 2** | 任务契约与异步骨架 | 定义请求体，实现 202 Accepted 与后台任务 | 立即返回 202，后台模拟执行 | 待执行 |
| Step 3 | 接入真实 Pipeline (本地模式) | 集成 `core.runner` 跑通步骤 1,2,3,4,5,8 | 本地生成中间产物与笔记 | 待执行 |
| **Step 4** | 产物生成与固定命名 | 确保生成 Markmap MD 与 Word 文档 | 检查本地文件存在性 | 待执行 |
| **Step 5** | COS 存储集成 | 实现 PDF 下载与产物/中间件上传 | COS 出现对应文件 | 待执行 |
| **Step 6** | MySQL 状态同步 | Worker 实时写入 Job/Step/Artifact 表 | 数据库状态随进度更新 | 待执行 |
| **Step 7** | NestJS 触发集成 | NestJS Service 调用 Worker 接口 | 创建任务后 Worker 自动启动 | 待执行 |

---

## Step 1: Worker 基础架构与鉴权 ✅

### 步骤目标
确保 Worker 服务具备基础安全性，仅允许持有正确 Token 的请求访问业务接口。

### 实施总结
1. **新增** `pdf_to_anki/src/api/auth.py`：实现了基于 `X-Worker-Token` 请求头的校验逻辑，并从 `.env` 读取 `PDF_TO_ANKI_WORKER_TOKEN`。
2. **修改** `pdf_to_anki/src/api/main.py`：
   - 引入 `Depends` 机制。
   - 将 `generate-notes`, `generate-anki`, `reset-pages` 接口全部接入鉴权。
3. **环境配置**：在 `.env` 中初始化了 `PDF_TO_ANKI_WORKER_TOKEN=devtoken`。

### 验证结果
- **健康检查**：`GET /api/pdf-note/health` -> `200 OK` (无需 Token)。
- **非法访问**：无 Token 或错误 Token -> `401 Unauthorized`。
- **合法访问**：正确 Token -> `200 OK` (当前模型字段均为可选，故返回 200)。
- **Token 隔离**：验证了 User JWT 无法通过 Worker 鉴权，确保了内部通信安全性。

### 验证脚本
```bash
# 1. 验证健康检查（无需 Token，应返回 200）
curl -i http://localhost:8000/api/pdf-note/health

# 2. 验证业务接口（无 Token，应返回 401）
curl -i -X POST http://localhost:8000/api/pdf-note/generate-notes

# 3. 验证业务接口（带 Token，应返回 200/422）
curl -i -X POST http://localhost:8000/api/pdf-note/generate-notes \
  -H "X-Worker-Token: devtoken" \
  -H "Content-Type: application/json" -d "{}"
```

### 回滚策略
- 移除 `api/main.py` 中的 `Depends` 校验。

---

## Step 2: 任务契约与异步骨架

### 步骤目标
定义 Worker 与 Backend 之间的通讯契约，实现“立即响应、后台处理”的异步模式。

### 修改代码
1. **新增** `pdf_to_anki/src/api/models.py`：定义 `NoteGenRequestDto`。
   - **关键字段**：`jobId`, `steps`, `pdf` (含 `cosKey`, `fileName` 等), `resultCosPrefix`。
2. **新增** `pdf_to_anki/src/core/registry.py`：实现内存状态机，记录 Job 进度。
3. **修改** `pdf_to_anki/src/api/main.py`：
   - 使用 `BackgroundTasks` 启动模拟任务。
   - 校验 `pipelineKey` 与 `steps` 的匹配性。

### 验证脚本
```bash
# 发起任务（应立即返回 202 Accepted）
curl -i -X POST http://localhost:8000/api/pdf-note/generate-notes \
  -H "X-Worker-Token: devtoken" -H "Content-Type: application/json" \
  -d '{
    "jobId": "00000000-0000-0000-0000-000000000001",
    "userId": 2,
    "kbPdfId": 1,
    "pipelineKey": "generate-notes",
    "steps": [1,2,3,4,5,8],
    "pageRange": {"mode": "all"},
    "pdf": {"cosBucket": "b", "cosRegion": "r", "cosKey": "k", "etag": "e", "sizeBytes": 1024, "pageCount": 10},
    "resultCosPrefix": "kb/2/_note_gen/1/000.../",
    "configSnapshot": {"configSchemaVersion": 1, "steps": {}}
  }'

# 查询内存状态（应显示 processing 或 completed）
curl http://localhost:8000/api/pdf-note/jobs/00000000-0000-0000-0000-000000000001 -H "X-Worker-Token: devtoken"
```

---

## Step 3: 接入真实 Pipeline (本地模式)

### 步骤目标
将现有的 `core/runner.py` 逻辑接入异步任务，实现真实的 PDF 处理流程（暂不涉及 COS）。

### 修改代码
1. **修改** `pdf_to_anki/src/api/main.py`：在后台任务中调用 `core.runner.run_steps`。
2. **临时支持**：在请求体中增加 `localPdfPath` 字段，用于本地调试。
3. **进度更新**：在每步执行完后更新 `core.registry` 中的 `progressPercent`（按 16.6% 递增）。

### 验证脚本
```bash
# 发起本地处理任务
curl -i -X POST http://localhost:8000/api/pdf-note/generate-notes \
  -H "X-Worker-Token: devtoken" -H "Content-Type: application/json" \
  -d '{
    "jobId": "00000000-0000-0000-0000-000000000002",
    "localPdfPath": "D:/test/sample.pdf",
    "steps": [1,2,3,4,5,8],
    "pipelineKey": "generate-notes"
    ... (其他必填字段)
  }'

# 轮询进度，观察 progressPercent 是否变化
```

---

## Step 4: 产物生成与固定命名

### 步骤目标
确保 Step 8 执行后，生成的笔记文件符合 99AI-ANKI 的交付要求，且文件名包含原始 PDF 名称。

### 修改代码
1. **修改** `pdf_to_anki/src/core/pipeline.py`：
   - 获取原始文件名 `pdf_name = request.pdf.fileName`（去除后缀）。
   - **Markmap MD**：命名为 `{pdf_name}_knowledge_base_notes_markmap.md`。
   - **Word 文档**：命名为 `{pdf_name}_knowledge_base_notes.docx`。
2. **固定路径**：所有产物统一存放在 `work/kb/{userId}/{kbPdfId}/pipeline/{jobId}/`。

### 验证脚本
- 运行 Step 3 的测试。
- 检查本地目录：`ls work/kb/2/1/pipeline/000.../` 是否存在上述两个文件。

---

## Step 5: COS 存储集成

### 步骤目标
实现从腾讯云 COS 下载源 PDF，并将处理结果（中间件与最终产物）上传回 COS。

### 修改代码
1. **新增** `pdf_to_anki/src/cos_client.py`：封装下载与上传逻辑。
2. **修改** 任务流程：
   - 执行前：从 `pdf.cosKey` 下载到本地 `source.pdf`。
   - 执行中/后：将 `pipeline/{jobId}/` 下的文件同步到 `resultCosPrefix`。

### 验证脚本
- 使用真实的 COS 凭据运行任务。
- 登录腾讯云控制台，验证 `resultCosPrefix` 目录下是否出现了 `knowledge_base_notes.docx` 等文件。

---

## Step 6: MySQL 状态同步

### 步骤目标
Worker 直接操作 99AI-ANKI 的数据库，实现任务状态、用量明细和产物记录的持久化。

### 修改代码
1. **新增** `pdf_to_anki/src/db_client.py`：使用 SQLAlchemy 或 Tortoise ORM 连接 MySQL。
2. **修改** 任务流程：
   - 开始时：更新 `note_gen_job.status = 'processing'`。
   - 每步结束：插入 `note_gen_job_step_usage` 记录。
   - 产物上传后：插入 `note_gen_job_artifact` 记录。
   - 全部结束：更新 `note_gen_job.status = 'completed'`, `completedAt = NOW()`, `cleanupAt = NOW() + 7d`。

### 验证脚本
```bash
# 1. 在 99AI 侧创建一个 Job (status=created)
# 2. 调用 Worker 处理该 Job
# 3. 检查数据库
mysql -u root -p -e "SELECT status, progressPercent FROM note_gen_job WHERE jobId='...';"
mysql -u root -p -e "SELECT * FROM note_gen_job_step_usage WHERE jobId='...';"
```

---

## Step 7: NestJS 触发集成

### 步骤目标
打通 NestJS 后端与 Python Worker 的最后一步：在用户创建任务时自动通知 Worker。

### 修改代码
1. **修改** `service/src/modules/noteGen/noteGen.service.ts`：
   - 在 `createJob` 成功落库后，调用 `this.httpService.post(workerUrl, payload)`。
   - 负载包含 Job 的完整快照。
2. **配置**：在 `.env` 中添加 `PDF_TO_ANKI_WORKER_URL` 和 `PDF_TO_ANKI_WORKER_TOKEN`。

### 验证脚本
```bash
# 使用真实用户 JWT 发起请求
curl -X POST http://localhost:9520/api/note-gen/jobs \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "kbPdfId": 5, "pageRange": { "mode": "all" } }'

# 观察 Worker 日志，确认收到请求并开始处理。
# 观察 Chat 界面或通过 API 轮询，确认进度在自动更新。
```

### 回滚策略
- 注释掉 `NoteGenService` 中调用 Worker 的代码。

---

## 附录：测试凭据

- **User JWT**: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImYwY2IxNjVlYiIsImlkIjoyLCJlbWFpbCI6IjExMzI2NTAxMDhAcXEuY29tIiwicm9sZSI6InZpZXdlciIsIm9wZW5JZCI6IiIsImNsaWVudCI6bnVsbCwicGhvbmUiOm51bGwsImlhdCI6MTc2NjQwNDcyOSwiZXhwIjoxNzY3MDA5NTI5fQ.TYXMQOOd5hzNjR6XT6kMYOwE1xG1Rio8-G0i0LVt6JA`
- **Admin JWT**: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InN1cGVyY3giLCJpZCI6MSwiZW1haWwiOiJzdXBlcmN4Iiwicm9sZSI6InN1cGVyIiwib3BlbklkIjoiIiwiY2xpZW50IjpudWxsLCJwaG9uZSI6bnVsbCwiaWF0IjoxNzY2NDA3Mjc3LCJleHAiOjE3NjcwMTIwNzd9.dq3pPb-qig2BaYti7Fa48RKO12RwkX0RRh82pC2cOgs`
- **Worker Token**: `devtoken`
