# 99AI-ANKI：第6章（Worker 实现与集成）开发路线步骤

> 文档说明：本路线基于 `99AI-ANKI\docs\20251221cx-bj-preview.md` 方案与 `pdf_to_anki\docs\20251221cx步骤流程.md`，将第6章的 Worker 实现与后端集成拆分为 7 个增量、可运行的原子步骤。
> 
> 目标：实现 Python Worker 的异步处理能力，并与 NestJS 后端完成状态同步与闭环。

---

## 开发路线概览

| 步骤 | 任务名称 | 核心内容 | 验证点 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **Step 1** | Worker 基础架构与鉴权 | 实现 `X-Worker-Token` 校验与健康检查 | 401 -> 200 | ✅ 已完成 |
| **Step 2** | 任务契约与异步骨架 | 定义请求体，实现 202 Accepted 与后台任务 | 立即返回 202，后台模拟执行 | ✅ 已完成 |
| **Step 3** | 接入真实 Pipeline (本地模式) | 集成 `core.runner` 跑通步骤 1,2,3,4,5,8 | 本地生成中间产物与笔记 | ✅ 已完成 |
| **Step 3.5** | 异常处理与日志优化 | 增加任务超时机制与 JobId 日志隔离 | 模拟超时与并发日志检查 | ✅ 已完成 |
| **Step 4** | 产物生成与固定命名 | 确保生成 Markmap MD 与 Word 文档 | 检查本地文件存在性 | ✅ 已完成 |
| **Step 5** | COS 存储集成 | 实现 PDF 下载与产物/中间件上传 | COS 出现对应文件 | 待执行 |
| **Step 6** | MySQL 状态同步 | Worker 实时写入 Job/Step/Artifact 表 | 数据库状态随进度更新 | 待执行 |
| **Step 7** | NestJS 触发集成 | NestJS Service 调用 Worker 接口 | 创建任务后 Worker 自动启动 | 待执行 |
| **Step 8** | 长耗时任务稳定性优化 | 解决 1 小时+ 任务的超时、假死与恢复问题 | 模拟长任务，重启后可断点续传 | 待执行 |

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

### 回滚策略
- 移除 `api/main.py` 中的 `Depends` 校验。

---

## Step 2: 任务契约与异步骨架 ✅

### 步骤目标
定义 Worker 与 Backend 之间的通讯契约，实现“立即响应、后台处理”的异步模式。

### 实施总结
1. **新增** `pdf_to_anki/src/api/models.py`：定义了 `NoteGenRequestDto` 及其子模型（`PdfInfo`, `PageRange`），完全对齐 99AI-ANKI 后端需求。
2. **新增** `pdf_to_anki/src/core/registry.py`：实现了基于内存的 `JobRegistry`，支持线程安全的任务状态与进度追踪。
3. **修改** `pdf_to_anki/src/api/main.py`：
   - 引入 `BackgroundTasks` 实现异步处理。
   - 实现了 `POST /api/pdf-note/generate-notes`：包含严格的 `pipelineKey`、`steps` 和 `pageRange` 校验，支持幂等检查，并立即返回 `202 Accepted`。
   - 新增 `GET /api/pdf-note/jobs/{jobId}`：允许通过 Job ID 查询内存中的实时进度。
   - **稳定性优化**：将 `simulate_processing` 定义为同步 `def` 并在线程池运行，避免阻塞 FastAPI 主事件循环，确保长耗时任务下接口仍可响应。
   - **动态进度**：进度计算逻辑从硬编码改为基于 `steps` 列表长度动态计算，每完成一个 Step 更新一次进度。

### 验证结果
- **任务提交**：发送符合契约的 JSON -> 立即返回 `202 Accepted`。
- **异步执行**：后台日志显示模拟任务按 Step 顺序启动。
- **进度查询**：轮询 `GET /api/pdf-note/jobs/{jobId}` -> 观察到 `status` 从 `processing` 变为 `completed`，`progressPercent` 呈阶梯状（16% -> 33% -> ... -> 100%）增长。
- **幂等性**：对正在处理的任务再次提交 -> 返回 `202` 并提示 `Job already processing`，不重复启动任务。
- **非阻塞验证**：验证了在后台任务运行期间，`GET /health` 和进度查询接口响应迅速，无假死现象。

### 验证脚本
```bash
# 1. 发起任务（应立即返回 202 Accepted）
curl -i -X POST http://localhost:8000/api/pdf-note/generate-notes \
  -H "X-Worker-Token: devtoken" -H "Content-Type: application/json" \
  -d '{
    "jobId": "test-job-001",
    "userId": 2,
    "kbPdfId": 1,
    "pipelineKey": "generate-notes",
    "steps": [1,2,3,4,5,8],
    "pageRange": {"mode": "all"},
    "pdf": {"cosBucket": "b", "cosRegion": "r", "cosKey": "k", "etag": "e", "sizeBytes": 1024, "pageCount": 10, "fileName": "test.pdf"},
    "resultCosPrefix": "kb/2/_note_gen/1/test-job-001/",
    "configSnapshot": {"configSchemaVersion": 1, "steps": {}}
  }'

# 2. 轮询进度（应显示进度变化）
curl http://localhost:8000/api/pdf-note/jobs/test-job-001 -H "X-Worker-Token: devtoken"
```

### 回滚策略
- 还原 `api/main.py`，删除 `api/models.py` 和 `core/registry.py`。

---

## Step 3: 接入真实 Pipeline (本地模式) ✅

### 步骤目标
将现有的 `core/runner.py` 逻辑接入异步任务，实现真实的 PDF 处理流程（暂不涉及 COS）。

### 实施总结
1. **修改** `pdf_to_anki/src/api/main.py`：
   - **环境映射**：将 `NoteGenRequestDto` 中的字段（如 `localPdfPath`）和 `configSnapshot` 中的模型配置映射为 `core/runner` 所需的环境变量。
   - **路径对齐**：强制设置 `PDF_TO_ANKI_BOOK_NAME="."` 并使用绝对路径（基于 `PROJECT_ROOT`），确保 Step 1-8 在同一个 `pipeline/{jobId}` 目录下工作，解决了 Step 1 与后续步骤的路径断裂问题。
   - **分步执行**：在循环中逐个调用 `run_steps([step_num], env)`，确保每一步完成后都能实时更新 `job_registry` 中的进度。
   - **错误处理**：捕获执行过程中的异常，并将错误信息记录到 `job_registry`，状态置为 `failed`。
2. **修改** `pdf_to_anki/src/core/test_step1_wholepdf.py`：支持 `book_name="."` 的扁平化输出模式，不再强制创建以 PDF 文件名命名的子目录。
3. **接口集成**：将 `POST /api/pdf-note/generate-notes` 的后台任务从模拟函数切换为 `run_actual_pipeline`。

### 验证结果
- **全链路跑通**：使用 `test_step3.py` 验证了从 PDF 读取到 Word/Markmap 产出的完整闭环。
- **进度同步**：轮询接口 `/api/pdf-note/jobs/{jobId}` 能够正确返回 0% -> 16% -> ... -> 100% 的状态。
- **产物生成**：任务完成后，在本地 `work/kb/2/1/pipeline/{jobId}/` 目录下成功生成了中间 JSON 文件和最终的笔记文件。
- **配置生效**：验证了 `configSnapshot` 中指定的模型（如 `gemini-3-flash-preview`）被正确传递给 Pipeline。

### 验证脚本
```bash
# 运行测试脚本（需确保 LOCAL_PDF_PATH 指向有效文件）
python -m test.test_step3
```

### 回滚策略
- 将 `api/main.py` 中的后台任务切回 `simulate_processing`。

---

## Step 3.5: 异常处理与日志优化 ✅

### 步骤目标
解决并发请求下的日志混乱问题，确保配置线程安全，并为长耗时任务增加超时保护。

### 实施总结
1. **日志隔离与增强**：
   - **新增** `utils/logger.py`：基于 `contextvars` 实现 `jobId` 隔离日志，在每行输出自动注入 `[jobId]` 标签（如 `[test-job-001]`）。
   - **全面迁移**：将 `core/` 目录下 Step 1, 2, 3, 4, 5, 8 的所有脚本从 `print` 切换为 `logger` 调用，确保底层流水线输出在并发时清晰可辨。
2. **配置重构 (Thread-Safety)**：
   - **修改** `core/config.py`：引入 `PipelineConfig` 冻结数据类（Frozen Dataclass），取代原有的全局 `os.environ` 依赖，确保每个并发 Job 拥有独立的配置快照。
3. **健壮性与容错**：
   - **LLM 容错**：在 Step 4 引入 `json_repair` 库，自动修复 LLM 返回的非标准 JSON 字符串。
   - **超时保护**：在 `api/main.py` 的步骤循环中增加 `timeout` 检查（默认 1 小时），防止僵尸任务占用资源。
   - **异常捕获**：统一使用 `logger.error` 记录堆栈，并确保在任务失败或超时时正确更新 `job_registry` 状态。
4. **产物命名优化 (Step 4 预研)**：
   - 更新 `PipelineConfig` 逻辑，使 Step 8 生成的 Markdown/Markmap/Word 文件名自动包含原始 PDF 名称（如 `{pdf_name}_knowledge_base_notes.docx`）。

### 验证结果
- **并发压力测试**：成功同时启动 3 个真实 PDF 任务（《中学综合素质》、《张宇8套卷》、《肖八背诵版》）。
- **日志隔离验证**：控制台日志显示 `[test-3.5-0]`, `[test-3.5-1]`, `[test-3.5-2]` 标签交替出现，各任务逻辑完全隔离，无数据串扰。
- **进度实时同步**：通过轮询接口观察到 3 个任务独立推进，进度从 `0% -> 16% -> 50% -> 100%` 阶梯式增长，最终全部成功完成。
- **超时与容错**：验证了即使在并发环境下，系统也能准确触发超时保护，并能通过 `json_repair` 纠正 LLM 的非标准输出。

### 验证脚本
```bash
# 运行并发、超时与日志隔离综合测试
python -m test.test_step_3_5
```

### 回滚策略
- 移除 `utils/logger.py`，将 `main.py` 中的 `logger` 换回 `print`。

---

## Step 4: 产物生成与固定命名 ✅

### 步骤目标
确保 Step 8 执行后，生成的笔记文件符合 99AI-ANKI 的交付要求，且文件名包含原始 PDF 名称。

### 实施总结
1. **动态命名逻辑**：
   - 修改 `core/config.py`，在 `PipelineConfig` 中实现了基于 `{book_name}` 的动态路径属性。
   - **Markmap MD**：自动命名为 `{pdf_name}_knowledge_base_markmap_notes.md`。
   - **Word 文档**：自动命名为 `{pdf_name}_knowledge_base_notes.docx`。
   - **Markdown**：自动命名为 `{pdf_name}_knowledge_base_notes.md`。
2. **路径标准化**：所有产物统一存放在 `work/kb/{userId}/{kbPdfId}/pipeline/{jobId}/` 目录下，确保路径结构与后端逻辑完全对齐。
3. **脚本适配**：更新了 Step 8 的三个生成脚本（Markdown, Markmap, Word），使其完全通过 `config` 对象获取输出路径，消除了硬编码。

### 验证结果
- **固定命名校验**：在 `work/kb/2/1/pipeline/` 目录下，成功生成了如下文件：
  - `20251中学综合素质1-10_knowledge_base_notes.docx`
  - `【数一试题】2026版张宇8套卷（卷一）_knowledge_base_markmap_notes.md`
- **产物完整性**：验证了 Word 文档通过 Pandoc 转换后，标题层级（1-3级）与公式渲染正常，且文件名自动去除了路径中的非法字符。
- **全量跑通**：3 个并发任务均成功产出了对应的 Markdown、Markmap 和 Word 笔记，证明了 Step 8 在多任务环境下的稳定性。

### 回滚策略
- 还原 `core/config.py` 中的文件名定义。

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

## Step 8: 长耗时任务稳定性优化

### 步骤目标
针对 PDF 处理可能耗时 1 小时以上的特性，从全局视角解决 HTTP 超时、进程假死、任务丢失等稳定性问题。

### 核心解决方案（全局思考）
1. **异步解耦 (已在 Step 2 实现)**：
   - 使用 `202 Accepted` 立即返回，规避 HTTP 层的 `504 Gateway Timeout`。
   - 使用 FastAPI 线程池运行任务，确保主线程（Event Loop）始终活跃，能够响应健康检查和进度查询。
2. **任务持久化 (将在 Step 6 实现)**：
   - 放弃内存状态，将任务进度实时写入 MySQL。
   - **断点续传**：Worker 启动时检查 `processing` 状态的任务，根据本地/COS 产物存在性自动恢复执行。
3. **LLM 接口保护 (已在 LLMClient 实现)**：
   - 设置 `aiohttp.ClientTimeout(total=600)`，防止单次大模型调用无限期挂起。
4. **进程级守护 (部署建议)**：
   - 部署时使用 Gunicorn/Uvicorn 并设置 `--timeout 0`。
   - 配合 Supervisor 或 Docker 的 `restart: always`，确保进程崩溃后能立即重启并触发“断点续传”。
5. **资源隔离 (未来扩展)**：
   - 引入 `asyncio.Semaphore` 限制并发任务数，防止多个 1 小时任务同时运行导致内存溢出（OOM）。

### 验证脚本
- 模拟一个每步 `time.sleep(600)` (10分钟) 的长任务。
- 在任务运行期间，手动重启 Worker 进程。
- 检查重启后，任务是否能从数据库读取状态并继续运行。

---

## 附录：测试凭据

- **User JWT**: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImYwY2IxNjVlYiIsImlkIjoyLCJlbWFpbCI6IjExMzI2NTAxMDhAcXEuY29tIiwicm9sZSI6InZpZXdlciIsIm9wZW5JZCI6IiIsImNsaWVudCI6bnVsbCwicGhvbmUiOm51bGwsImlhdCI6MTc2NjQwNDcyOSwiZXhwIjoxNzY3MDA5NTI5fQ.TYXMQOOd5hzNjR6XT6kMYOwE1xG1Rio8-G0i0LVt6JA`
- **Admin JWT**: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InN1cGVyY3giLCJpZCI6MSwiZW1haWwiOiJzdXBlcmN4Iiwicm9sZSI6InN1cGVyIiwib3BlbklkIjoiIiwiY2xpZW50IjpudWxsLCJwaG9uZSI6bnVsbCwiaWF0IjoxNzY2NDA3Mjc3LCJleHAiOjE3NjcwMTIwNzd9.dq3pPb-qig2BaYti7Fa48RKO12RwkX0RRh82pC2cOgs`
- **Worker Token**: `devtoken`
