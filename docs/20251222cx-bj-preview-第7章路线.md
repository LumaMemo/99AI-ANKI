# 99AI-ANKI：第7章（存储同步、级联删除与 7 天清理）开发路线步骤

> 文档说明：本路线基于 `99AI-ANKI\docs\20251221cx-bj-preview.md` 方案，聚焦于系统维护、存储一致性、级联删除及 Worker 本地空间管理。
>
> 目标：确保生成笔记的产物在 COS 与本地之间稳定同步，实现 PDF 删除时的资源彻底清理，并自动维护 Worker 磁盘空间。

---

## 调研总结：目前已完成内容

1.  **Worker 侧 (Python)**：
    *   `CosService` 已实现 `upload_directory`（递归上传）、`download_file` 和 `download_directory`（递归下载）。
    *   `run_actual_pipeline` 已实现任务结束自动上传产物，以及本地缺失时自动从 COS 回落下载。
    *   `DBService` 已实现用量上报、产物元数据记录，并在任务 `completed` 时自动设置 `cleanupAt = NOW() + 7 Days`。
2.  **后端侧 (NestJS)**：
    *   `KbService` 已实现 `deleteFileCore`，但目前仅能删除源 PDF 文件，尚未关联清理 `note_gen_job` 及其产物。
    *   `NoteGenService` 已具备基础的任务创建与查询能力，但缺乏级联删除接口。

---

## 开发路线概览

| 步骤 | 任务名称 | 核心内容 | 验证点 |
| :--- | :--- | :--- | :--- |
| **Step 1** | Worker：用量与产物上报 | 写入 `step_usage` 与 `artifact` 表 | 数据库出现明细记录 (✅ 已完成) |
| **Step 2** | Worker：COS 回落下载 | 本地缺失时从 COS 同步中间产物 | 跨节点/清理后可续跑 (✅ 已完成) |
| **Step 3** | Worker：7 天本地自动清理 | 定时扫描并删除过期本地目录 | 磁盘空间自动释放 (✅ 已完成) |
| **Step 4** | Backend：级联删除集成 | 删除 PDF 时清理 Job、Artifact 及 COS | 资源无残留 (✅ 已完成) |
| **Step 5** | Backend：存储计量增强 | 产物大小计入 KB 用户配额 | `usedBytes` 随产物增加 (✅ 已完成) |

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

### Step 1: Worker：用量与产物上报 (✅ 已完成)

#### 实施细节
1.  **DBService 增强**：确认并完善了 `upsert_step_usage` 和 `upsert_artifact` 方法，支持 `ON DUPLICATE KEY UPDATE`。
2.  **步骤状态追踪**：在 `core/pipeline.py` 中，每个步骤开始时会先写入 `status='processing'`，结束后更新为 `success` 或 `failed`，并记录 Token 用量。
3.  **产物自动上报**：在 `api/main.py` 的 `run_actual_pipeline` 中，COS 上传完成后，自动扫描本地目录，将最终笔记（MD/Word/Markmap）及关键中间产物（JSON）的元数据上报至 `note_gen_job_artifact` 表。
4.  **解耦优化**：将产物上报逻辑从核心流水线 `core/pipeline.py` 移至 API 层 `api/main.py`，确保在 COS 确认上传后才记录产物状态。

### 修改代码

#### 1. `pdf_to_anki/src/services/db_service.py`
```python
def upsert_step_usage(self, job_id, step_number, status, ...):
    # 使用 INSERT INTO ... ON DUPLICATE KEY UPDATE 记录 Token 用量
    pass

def upsert_artifact(self, job_id, artifact_type, status, file_name, ...):
    # 记录产物元数据（文件名、大小、COS 路径等）
    pass
```

#### 2. `pdf_to_anki/src/api/main.py`
```python
# 在 run_actual_pipeline 结尾处
if cos_service and effective_cos_prefix:
    cos_service.upload_directory(final_job_dir, effective_cos_prefix)
    # 遍历本地文件并调用 db_service.upsert_artifact
```

### 验证脚本
```bash
# 1. 触发一个任务
curl -X POST http://localhost:8000/api/pdf-note/generate-notes ...
# 2. 检查数据库
# SELECT * FROM note_gen_job_step_usage;
# SELECT * FROM note_gen_job_artifact;
```

---

## Step 2: Worker：COS 回落下载 (✅ 已完成)

### 步骤目标
实现“回落下载”机制：当 Worker 本地目录被清理或任务在不同节点续跑时，能自动从 COS 下载已有的中间产物，避免重复计算。

#### 实施细节
1.  **CosService 增强**：在 `pdf_to_anki/src/services/cos_service.py` 中实现了 `download_directory` 方法，利用 `list_objects` 递归获取文件列表并批量调用 `download_file`。
2.  **回落逻辑集成**：在 `pdf_to_anki/src/api/main.py` 的 `run_actual_pipeline` 中，在环境准备阶段增加 `os.listdir` 检查。若本地目录仅包含 PDF 或为空，则触发回落。
3.  **自动同步**：若检测到本地缺失中间产物且请求包含 `resultCosPrefix`，则自动从 COS 下载，确保任务可跨节点或在清理后无缝续跑。

### 修改代码

#### 1. `pdf_to_anki/src/services/cos_service.py`
```python
def download_directory(self, cos_prefix, local_dir):
    # 递归获取 COS 目录下所有对象并下载到本地
    pass
```

#### 2. `pdf_to_anki/src/api/main.py`
```python
# --- NEW: Fallback Download from COS ---
if cos_service and request.resultCosPrefix:
    local_files = os.listdir(final_job_dir)
    other_files = [f for f in local_files if f != request.pdf.fileName]
    if not other_files:
        logger.info(f"📥 Detected missing local intermediate files, attempting fallback...")
        cos_service.download_directory(request.resultCosPrefix, final_job_dir)
```

### 验证脚本
```bash
python pdf_to_anki/src/test/test_cxbj_cap7_step2.py
```

---

## Step 3: Worker：7 天本地自动清理 (✅ 已完成)

### 步骤目标
释放 Worker 节点的磁盘空间，自动清理已完成超过 7 天的任务目录。

#### 实施细节
1.  **清理触发增强**：修改了 `pdf_to_anki/src/services/db_service.py` 中的 `update_job_status`，确保任务无论是 `completed` 还是 `failed`，都会设置 `cleanupAt = NOW() + 7 Days`。
2.  **过期目录识别**：在 `DBService` 中新增 `get_expired_kb_dirs` 方法。该方法通过 SQL 聚合查询，确保某个 PDF 关联的所有任务都已结束且最晚的清理时间已过期，才触发清理。
3.  **后台任务集成**：在 `pdf_to_anki/src/api/main.py` 中利用 `asyncio.create_task` 启动了一个永久循环的后台任务 `auto_cleanup_task`，每小时执行一次扫描与清理。
4.  **安全清理**：使用 `shutil.rmtree(path, ignore_errors=True)` 递归删除本地 `work/kb/{userId}/{kbPdfId}` 目录，确保磁盘空间释放。

### 修改代码

#### 1. `pdf_to_anki/src/services/db_service.py`
```python
# 更新状态变更逻辑
if status in ('completed', 'failed'):
    if status == 'completed':
        updates.append("completedAt = %s")
        params.append(datetime.now())
    updates.append("cleanupAt = DATE_ADD(NOW(), INTERVAL 7 DAY)")

# 新增过期目录查询
def get_expired_kb_dirs(self) -> List[Dict[str, Any]]:
    sql = """
    SELECT userId, kbPdfId FROM note_gen_job 
    GROUP BY userId, kbPdfId
    HAVING SUM(status = 'processing') = 0 AND MAX(cleanupAt) < NOW()
    """
    # ... 执行并返回结果
```

#### 2. `pdf_to_anki/src/api/main.py`
```python
async def auto_cleanup_task():
    while True:
        expired_dirs = db_service.get_expired_kb_dirs()
        for d in expired_dirs:
            target_dir = PROJECT_ROOT / "work" / "kb" / str(d['userId']) / str(d['kbPdfId'])
            shutil.rmtree(target_dir, ignore_errors=True)
        await asyncio.sleep(3600)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(auto_cleanup_task())
    # ...
```

### 验证脚本
1.  **逻辑验证**：`python pdf_to_anki/src/test/test_cxbj_cap7_step3_cleanup.py`
2.  **集成验证**：`python pdf_to_anki/src/test/test_cxbj_cap7_step3_db_integration.py`
    *   **预期结果**：后端日志显示 `🧹 Running auto cleanup task...` -> `🔍 Found 1 expired KB directories` -> `🗑️ Cleaning up expired local directory`。

---

## Step 4: Backend：级联删除集成 (✅ 已完成)

### 步骤目标
当用户在前端删除一个 PDF 文件时，后端应自动清理所有关联的生成任务记录、产物记录，并递归删除 COS 上的整个产物文件夹（包含 PDF、中间产物和最终笔记）。

#### 实施细节
1.  **目录级 COS 清理**：在 `KbService.deleteFileCore` 中，通过 PDF 的 `cosKey` 自动推导所属文件夹前缀（如 `kb/2/_note_gen/1/`），并调用 `deleteCosDirectory` 递归删除该目录下所有对象。这比按 Job 删除更彻底，能清理掉所有未记录在 DB 中的残留文件。
2.  **NoteGenService 级联清理**：新增 `deleteJobsByPdfId(kbPdfId)` 方法。
    *   物理删除 `note_gen_job_artifact`、`note_gen_job_step_usage` 及 `note_gen_job` 记录。
    *   返回所有已删除产物的总大小（字节），用于配额扣减。
3.  **配额精确扣减**：更新 `usedBytes` 扣减逻辑：`totalDelta = pdfSize + artifactSize`。使用 SQL `GREATEST(usedBytes - :delta, 0)` 确保配额扣减的原子性与安全性。
4.  **安全保障**：
    *   `deleteCosDirectory` 增加了对空前缀、根路径（`/`）及非法路径的校验，防止误删全桶数据。
    *   COS 删除采用 Best-effort 模式，失败会记录错误日志但不会中断数据库记录的清理流程。

### 修改代码

#### 1. `99AI-ANKI/service/src/modules/noteGen/noteGen.service.ts`
```typescript
async deleteJobsByPdfId(kbPdfId: number) {
  // 1. 查找所有关联 Job
  // 2. 累加 note_gen_job_artifact 中的文件大小
  // 3. 物理删除 Artifact, StepUsage, Job 记录
  // 4. 返回 totalArtifactBytes
}
```

#### 2. `99AI-ANKI/service/src/modules/kb/kb.service.ts`
```typescript
private async deleteFileCore(userId: number, id: number) {
  // 1. 计算文件夹前缀: const folderPrefix = record.cosKey.substring(0, lastSlashIndex + 1);
  // 2. 递归删除 COS 目录: await this.deleteCosDirectory(..., folderPrefix);
  // 3. 清理 Job 记录并获取产物大小: const artifactBytes = await this.noteGenService.deleteJobsByPdfId(id);
  // 4. 统一扣减配额: const totalDelta = record.sizeBytes + artifactBytes;
}
```

### 验证脚本
```bash
# 1. 准备测试数据 (使用 Python 脚本模拟 Job 和 Artifact)
python pdf_to_anki/src/test/test_cxbj_cap7_step4.py

# 2. 使用用户 JWT 调用删除接口
curl -X DELETE http://localhost:9520/api/kb/files/7 \
  -H "Authorization: Bearer <JWT_TOKEN>" 

# 3. 验证结果：
# - 数据库: kb_pdf, note_gen_job, note_gen_job_artifact 中 ID 为 7 的关联记录全部消失。
# - COS: 对应的文件夹前缀（如 kb/2/_note_gen/7/）下所有文件被清空。
# - 配额: kb_user_usage.usedBytes 减少了 (PDF大小 + 产物总大小)。
```

---

## Step 5: Backend：存储计量增强 (API 驱动) (✅ 已完成)

### 步骤目标
通过“Worker 主动上报”机制，将生成的笔记（Markdown/Word）及中间产物的大小正式计入用户的知识库存储配额，实现计算与业务逻辑的解耦。

### 实施细节
1.  **后端：配额更新原子化**：
    *   在 `KbService` 中实现了 `updateUserUsage(userId, deltaBytes)`，支持正负值更新，并使用 `GREATEST` 保证不为负。
2.  **后端：新增上报接口**：
    *   新增了 `WorkerNoteGenController` 专门处理 Worker 请求，路径为 `POST /api/worker/note-gen/report-artifacts`。
    *   引入了 `X-Worker-Token` 校验机制，确保接口安全。
    *   在 `NoteGenService.reportArtifacts` 中使用数据库事务，确保 `note_gen_job_artifact` 的写入与 `kb_user_usage` 的更新具有原子性。
3.  **Worker：上报逻辑切换**：
    *   新建了 `pdf_to_anki/src/services/backend_service.py` 封装 API 调用。
    *   修改了 `pdf_to_anki/src/api/main.py`，在任务结束上传 COS 后，自动调用后端 API 上报产物元数据。

### 修改代码

#### 1. `99AI-ANKI/service/src/modules/kb/kb.service.ts`
```typescript
async updateUserUsage(userId: number, deltaBytes: number) {
  // 原子更新 kb_user_usage 表中的 usedBytes
}
```

#### 2. `99AI-ANKI/service/src/modules/noteGen/noteGen.controller.ts`
```typescript
@Post('report-artifacts')
@ApiOperation({ summary: 'Worker 上报产物元数据并更新配额' })
async reportArtifacts(@Body() dto: ReportArtifactsDto) {
  return this.noteGenService.reportArtifacts(dto);
}
```

#### 3. `pdf_to_anki/src/services/api_client.py` (新建)
```python
def report_artifacts(self, job_id, artifacts):
    # 调用 NestJS 接口上报数据
    pass
```

### 验证脚本
1.  **空间增加验证**：
    *   记录初始 `usedBytes`。
    *   运行 Worker 任务，观察任务结束后 `usedBytes` 是否按产物大小增加。
2.  **空间扣减验证**：
    *   执行 Step 4 的删除操作。
    *   验证 `usedBytes` 是否回到了初始值（PDF + 产物均被扣除）。
3.  **并发验证**：
    *   模拟多个 Worker 同时上报，验证 `usedBytes` 是否准确累加。

---

## 回滚策略
1.  **Worker 侧**：若清理逻辑误删，由于 COS 已有备份，可通过 Step 2 的回落机制自动恢复，风险极低。
2.  **后端侧**：级联删除前建议在 `note_gen_job` 中先做软删除（`deletedAt`），确认无误后再物理删除或由定时任务清理。