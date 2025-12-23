# 99AI-ANKI：第7章（存储同步、级联删除与 7 天清理）开发路线步骤

> 文档说明：本路线基于 `99AI-ANKI\docs\20251221cx-bj-preview.md` 方案，聚焦于系统维护、存储一致性、级联删除及 Worker 本地空间管理。
>
> 目标：确保生成笔记的产物在 COS 与本地之间稳定同步，实现 PDF 删除时的资源彻底清理，并自动维护 Worker 磁盘空间。

---

## 调研总结：目前已完成内容

1.  **Worker 侧 (Python)**：
    *   `CosService` 已实现 `upload_directory`（递归上传）和 `download_file`。
    *   `run_actual_pipeline` 已在任务结束时调用 `upload_directory` 将产物同步至 COS。
    *   `DBService` 已在任务 `completed` 时自动设置 `cleanupAt = NOW() + 7 Days`。
2.  **后端侧 (NestJS)**：
    *   `KbService` 已实现 `deleteFileCore`，但目前仅能删除源 PDF 文件，尚未关联清理 `note_gen_job` 及其产物。
    *   `NoteGenService` 已具备基础的任务创建与查询能力，但缺乏级联删除接口。

---

## 开发路线概览

| 步骤 | 任务名称 | 核心内容 | 验证点 |
| :--- | :--- | :--- | :--- |
| **Step 1** | Worker：用量与产物上报 | 写入 `step_usage` 与 `artifact` 表 | 数据库出现明细记录 |
| **Step 2** | Worker：COS 回落下载 | 本地缺失时从 COS 同步中间产物 | 跨节点/清理后可续跑 |
| **Step 3** | Worker：7 天本地自动清理 | 定时扫描并删除过期本地目录 | 磁盘空间自动释放 |
| **Step 4** | Backend：级联删除集成 | 删除 PDF 时清理 Job、Artifact 及 COS | 资源无残留 |
| **Step 5** | Backend：存储计量增强 | 产物大小计入 KB 用户配额 | `usedBytes` 随产物增加 |

---

## Step 1: Worker：用量与产物上报

### 步骤目标
确保 Worker 在执行过程中实时记录每个步骤的 Token 用量，并在上传完成后记录产物元数据（对齐 `note_gen_job_step_usage` 和 `note_gen_job_artifact` 表）。

### 修改代码
1.  **修改** `pdf_to_anki/src/services/db_service.py`：增加 `upsert_step_usage` 和 `upsert_artifact` 方法。
2.  **修改** `pdf_to_anki/src/api/main.py`：在 `run_actual_pipeline` 的步骤循环中调用 `upsert_step_usage`；在 COS 上传完成后遍历本地文件调用 `upsert_artifact`。

### 验证脚本
```bash
# 1. 触发一个任务
curl -X POST http://localhost:8000/api/pdf-note/generate-notes \
  -H "X-Worker-Token: devtoken" -H "Content-Type: application/json" \
  -d '{"jobId": "sync-test-001", "userId": 2, "kbPdfId": 1, "pipelineKey": "generate-notes", "steps": [1,2,3,4,5,8], "pageRange": {"mode": "all"}, "pdf": {"cosBucket": "test", "cosRegion": "ap-shanghai", "cosKey": "kb/2/1.pdf", "fileName": "1.pdf"}, "resultCosPrefix": "kb/2/_note_gen/1/", "configSnapshot": {"steps": {}}}'

# 2. 检查数据库（SQL）
# SELECT * FROM note_gen_job_step_usage WHERE jobId = 'sync-test-001';
# SELECT * FROM note_gen_job_artifact WHERE jobId = 'sync-test-001';
```

---

## Step 2: Worker：COS 回落下载

### 步骤目标
实现“回落下载”机制：当 Worker 本地目录被清理或任务在不同节点续跑时，能自动从 COS 下载已有的中间产物，避免重复计算。

### 修改代码
1.  **修改** `pdf_to_anki/src/services/cos_service.py`：增加 `download_directory` 方法。
2.  **修改** `pdf_to_anki/src/api/main.py`：在 `run_actual_pipeline` 准备环境后，检查本地目录是否为空。若为空且 DB 中已有该 PDF 的成功步骤记录，则先从 `resultCosPrefix` 下载。

### 验证脚本
1.  手动删除本地 `work/kb/2/1/` 目录。
2.  再次触发同一 PDF 的任务。
3.  **观察日志**：应出现 `📥 Detected missing local files, downloading from COS...`。

---

## Step 3: Worker：7 天本地自动清理

### 步骤目标
释放 Worker 节点的磁盘空间，自动清理已完成超过 7 天的任务目录。

### 修改代码
1.  **修改** `pdf_to_anki/src/api/main.py`：使用 `fastapi_utils.tasks` 或 `asyncio` 创建一个每小时运行一次的后台任务。
2.  **逻辑**：查询 `note_gen_job` 中 `cleanupAt < NOW()` 且本地目录存在的记录，执行 `shutil.rmtree`。

### 验证脚本
1.  在数据库中手动修改某个已完成任务的 `cleanupAt` 为昨天。
2.  启动 Worker，观察日志是否出现 `🧹 Cleaning up expired local directory: ...`。

---

## Step 4: Backend：级联删除集成

### 步骤目标
当用户在前端删除一个 PDF 文件时，后端应自动清理所有关联的生成任务记录、产物记录，并递归删除 COS 上的产物目录。

### 修改代码
1.  **修改** `99AI-ANKI/service/src/modules/noteGen/noteGen.service.ts`：增加 `deleteJobsByPdfId(kbPdfId)` 方法，包含 COS 目录递归删除逻辑。
2.  **修改** `99AI-ANKI/service/src/modules/kb/kb.service.ts`：在 `deleteFileCore` 中引入 `NoteGenService` 并调用上述方法。

### 验证脚本
```bash
# 使用用户 JWT 删除文件
curl -X POST http://localhost:3000/kb/pdfs/1/delete \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." 

# 验证：数据库 note_gen_job 中该 kbPdfId 的记录应被删除，COS 对应目录应为空。
```

---

## Step 5: Backend：存储计量增强

### 步骤目标
将生成的笔记（Markdown/Word）及中间产物的大小计入用户的知识库存储配额。

### 修改代码
1.  **修改** `99AI-ANKI/service/src/modules/kb/kb.service.ts`：暴露 `updateUserUsage(userId, deltaBytes)` 接口。
2.  **修改** `99AI-ANKI/service/src/modules/noteGen/noteGen.service.ts`：在接收到 Worker 的产物上报或在级联删除时，调用 `updateUserUsage` 更新配额。

### 验证脚本
1.  记录删除前的 `kb_user_usage.usedBytes`。
2.  执行 Step 4 的删除操作。
3.  验证 `usedBytes` 是否正确扣减了产物所占空间。

---

## 回滚策略
1.  **Worker 侧**：若清理逻辑误删，由于 COS 已有备份，可通过 Step 2 的回落机制自动恢复，风险极低。
2.  **后端侧**：级联删除前建议在 `note_gen_job` 中先做软删除（`deletedAt`），确认无误后再物理删除或由定时任务清理。