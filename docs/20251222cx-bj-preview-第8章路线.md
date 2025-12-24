# 99AI-ANKI：第8章（计费与结算：点数 + Token）开发路线步骤

> 文档说明：本路线基于 `99AI-ANKI\docs\20251221cx-bj-preview.md` 方案，聚焦于生成笔记任务的计费逻辑。
>
> 目标：实现成本估算、准入门槛校验、完工后结算以及计费审计，确保用户点数消耗透明且支持灵活充值。

---

## 调研总结：目前已完成内容

1. **基础计费设施 (NestJS)**：
   * `UserBalanceService`：已实现 `deductFromBalance`，支持按 `deductType`（普通/高级）扣除点数。
   * `ModelsEntity`：已定义 `deduct`（单次扣费）、`deductType`（余额类型）、`isTokenBased`（是否按 Token 计费）等字段。
2. **任务数据模型 (NestJS)**：
   * `NoteGenJob`：已预留 `estimatedCostMinPoints`、`chargedPoints`、`chargeStatus` 等字段。
   * `NoteGenJobStepUsage`：已预留 `chargedPoints`、`chargeStatus` 等字段，用于记录单步结算事实。
3. **Worker 侧 (Python)**：
   * `DBService`：已实现 `upsert_step_usage`，能实时上报 Token 用量。

---

## 开发路线概览（计费纯粹化原则：针对已完成 1-7 章的补丁与升级）

| 步骤             | 任务名称              | 核心内容                                    | 验证点                                   |
| :--------------- | :-------------------- | :------------------------------------------ | :--------------------------------------- |
| **Step 1** | [补丁-第5章] Backend：`createJob` 升级 | 增加 10 点门槛校验与成本估算逻辑           | 余额不足拒绝创建；估算点数写入 DB         | [已完成] |
| **Step 2** | [新增] Backend：结算接口实现 | 实现 `charge-job` 接口，计算总价并执行扣费 | 任务完工后一次性扣费成功                 | [已完成] |
| **Step 3** | [补丁-第6章] Worker：结算触发集成 | 完工后调用后端结算接口发送信号             | Worker 完工后触发后端扣费                | [已完成] |
| **Step 4** | [补丁-第4章] 数据库状态语义同步 | 调整 Job 状态与计费字段的业务含义           | 状态机逻辑符合后扣费模式                 |
| **Step 5** | [新增] Admin：计费审计增强 | 在详情页展示 Token 消耗与扣费明细          | 管理端可见点数消耗事实                   |

---

## Step 1: [补丁-第5章] Backend：`createJob` 逻辑升级

### 步骤目标

在已完成的 `createJob` 接口中加入“准入门槛”校验和“成本估算”逻辑。

### 修改代码

1. **修改** `99AI-ANKI/service/src/modules/noteGen/noteGen.service.ts`：
   * **注入服务**：注入 `UserBalanceService`。
   * **增加门槛校验**：在方法开头查询用户余额，若 `sumModel3Count < 10`，抛出 `BadRequestException('发起笔记生成任务至少需要 10 普通积分')`。
   * **实现成本估算**：新增私有方法 `calculateEstimatedCost(pageCount)`。公式：`min = pageCount * 1.0`, `max = pageCount * 2.0`。
   * **写入 DB**：在 `noteGenJobRepo.create` 时写入 `estimatedCostMinPoints/MaxPoints`。

### 验证脚本

```bash
# 1. 使用余额不足 10 的账号发起任务 -> 预期 400 错误
# 2. 使用正常账号发起任务 -> 检查数据库中 estimatedCostPoints 是否按页数生成
```

---

## Step 2: [新增] Backend：实现 `charge-job` 结算接口

### 步骤目标

提供一个供 Worker 调用的内部接口，在整个任务成功完成后执行一次性全量扣费。

### 修改代码

1. **修改** `99AI-ANKI/service/src/modules/noteGen/noteGen.service.ts`：
   * 实现 `chargeJob(jobId)` 方法。
   * 逻辑：汇总该 Job 下所有 `step_usage` 的 Token 消耗 -> 根据模型单价计算总点数 -> 调用 `UserBalanceService.deductFromBalance`（允许扣至负数） -> 更新 Job 的 `chargeStatus = 'charged'`。
2. **修改** `99AI-ANKI/service/src/modules/noteGen/workerNoteGen.controller.ts`：
   * 新增 `POST /api/worker/note-gen/charge-job` 路由，配置 `X-Worker-Token` 鉴权。

---

## Step 3: [补丁-第6章] Worker：结算触发集成

### 步骤目标

在 Python Worker 的流水线结束时，向 99AI 后端发送结算信号。

### 修改代码

1. **修改** `pdf_to_anki/src/services/backend_service.py`：新增 `charge_job(job_id)` 方法。
2. **修改** `pdf_to_anki/src/api/main.py`：在 `run_actual_pipeline` 结尾，即 `report_artifacts` 成功后，调用 `backend_service.charge_job(job_id)`。
3. **逻辑控制**：Worker 仅负责触发，不关心扣费结果，不因扣费失败而标记任务失败。

---

## Step 4: [补丁-第4章] 数据库状态语义同步

### 步骤目标

确保数据库中的状态字段符合最新的“后扣费”业务语义。

### 修改内容

1. **状态机调整**：
   * 确认 `note_gen_job.status = 'failed'` 的触发场景不再包含“点数不足”（因为现在是后扣费，门槛校验在创建时已完成）。
   * 确认 `note_gen_job_step_usage.chargeStatus` 仅作为“该步骤用量已计入总账”的标记。

---

## Step 5: [新增] Admin：计费审计 UI 增强

### 步骤目标

在管理端详情页展示每个步骤的 Token 消耗、模型单价以及最终扣除的点数。

### 修改代码

1. **修改** `99AI-ANKI/admin/src/views/noteGen/detail.vue`：
   * 增加“计费明细”展示区域。
   * 展示列：步骤、模型、Token(P/C/T)、折算点数、结算状态。

---

## 验证清单（按此顺序测试）

1. **门槛测试**：找一个 0 积分账号，发起任务，预期返回 400。
2. **估算测试**：发起任务后，查看数据库 `estimatedCostPoints` 是否按页数正确生成。
3. **结算测试**：运行 Worker 完工后，检查用户余额是否减少，Job 状态是否变为 `charged`。
4. **负值测试**：找一个只有 10 积分的账号跑一个大任务，预期任务完成后余额变为负数。

---

## 回滚策略

1. **计费逻辑回滚**：若扣费出现偏差，可紧急将 `NoteGenService.chargeJob` 逻辑改为“仅记录不扣费”，待修复后再通过脚本补扣。
2. **幂等保护**：由于使用了 `jobId` 的唯一约束，重复调用不会导致超扣，风险受控。
3. **余额恢复**：若因系统错误多扣，可通过 `UserBalanceService.addBalanceToUser` 手动冲正。

---

## 实施记录

### [2025-12-25] Step 1 实施总结
1. **依赖引入**：在 `NoteGenModule` 中引入 `UserBalanceModule`。
2. **模型升级**：`KbPdfEntity` 增加 `pageCount` 字段。
3. **逻辑实现**：
   - `NoteGenService` 注入 `UserBalanceService`。
   - 实现 `calculateEstimatedCost`：`min = pageCount * 1.0`, `max = pageCount * 2.0`（容错处理：`pageCount` 为 0 时按 1 页计）。
   - `createJob` 增加门槛校验：**仅校验普通积分 (`sumModel3Count`)**，不足 10 点拦截。
4. **测试验证**：
   - 用户 ID 2（普通积分 7 点）发起任务，返回 `400` 错误，提示“发起笔记生成任务至少需要 10 普通积分”。
   - 验证通过。

### [2025-12-25] Step 2 实施总结
1. **余额服务升级**：`UserBalanceService.deductFromBalance` 增加 `allowNegative` 参数，支持后扣费模式下的负数余额。
2. **模块依赖完善**：`NoteGenModule` 引入 `ModelsEntity` 仓库，用于查询模型计费比例。
3. **结算逻辑实现**：
   - `NoteGenService` 实现 `chargeJob`：聚合 `step_usage` -> 查询模型 `tokenFeeRatio` -> 计算总点数 -> 调用 `deductFromBalance`。
   - 计费公式对齐系统：`points = deduct * ceil(tokens / tokenFeeRatio)`。
4. **Worker 接口开放**：`WorkerNoteGenController` 新增 `charge-job` 路由，受 `X-Worker-Token` 保护。
5. **测试验证**：
   - **测试用例**：针对 `jobId: aad217af-0c3e-41fc-b6a1-2414bc5fa70a` 调用结算接口。
   - **结算事实**：总消耗 Token 901,894，折算扣除 41 点普通积分。
   - **状态变更**：Job 状态成功更新为 `charged`，`step_usage` 明细同步标记为已结算。
   - **负值验证**：用户余额成功扣至负数（-24），验证了后扣费模式下的 `allowNegative` 逻辑。
   - **验证通过**。

### [2025-12-25] Step 3 实施总结
1. **Worker 服务升级**：`pdf_to_anki/src/services/backend_service.py` 新增 `charge_job` 方法，支持向后端发送结算信号。
2. **流水线集成**：在 `pdf_to_anki/src/api/main.py` 的 `run_actual_pipeline` 结尾，成功上报产物后，触发 `charge_job`。
3. **容错设计**：结算触发被包裹在 `try-except` 中，确保即使结算信号发送失败，也不会影响任务本身的“已完成”状态（符合“Worker 仅负责触发，不关心扣费结果”的设计原则）。
4. **测试验证**：
   - **模拟触发**：通过 `curl` 模拟 Worker 发送 `charge-job` 信号，后端成功接收并执行扣费逻辑。
   - **验证通过**。

### [2025-12-25] Step 4 实施总结
1. **状态机语义同步**：
   - 明确 `status = 'failed'` 仅代表技术故障，不再包含余额不足场景（已由 Step 1 门槛校验拦截）。
   - 在 `NoteGenService` 中实现 `updateJobStatus`，自动处理 `startedAt`、`completedAt` 及 7 天自动清理时间 `cleanupAt`。
2. **用量上报机制**：
   - 实现 `upsertStepUsage` 接口，支持 Worker 实时上报各步骤的模型、Token 消耗及错误信息。
   - 采用 `upsert` 逻辑，确保 Worker 重试时数据幂等。
3. **产物状态对齐**：
   - 将 `reportArtifacts` 中的产物状态从 `'success'` 修正为 `'ready'`，符合前端下载校验逻辑。
4. **Worker 接口补全**：
   - `WorkerNoteGenController` 开放 `update-status` 和 `upsert-step-usage` 路由，受 `X-Worker-Token` 保护。
5. **测试验证**：
   - **状态流转测试**：模拟 Worker 将任务从 `completed` 回退到 `processing` (55%)，再恢复到 `completed`，验证了进度强制 100% 及时间戳更新逻辑。
   - **用量上报测试**：模拟上报 Step 1 用量，验证了数据库记录的正确创建与更新。
   - **验证通过**。

### [2025-12-25] Step 5 实施总结
1. **Admin API 模块**：创建 `admin/src/api/modules/notegen.ts`，封装配置管理、任务列表、详情及下载接口。修正了 `request` 导入路径为 `../index`。
2. **路由与菜单**：
   - 新增 `admin/src/router/modules/notegen.menu.ts`，定义“笔记生成”主菜单及“任务管理”、“配置管理”子菜单。
   - 在 `admin/src/router/routes.ts` 中注册新菜单。
3. **计费审计 UI 实现**：
   - **任务列表页** (`notegen/index.vue`)：展示任务 ID、用户、文件名、状态、进度及已扣除点数。修正了 `loading.value` 逻辑及后端数据解构路径 (`res.data.rows`)。
   - **详情页增强** (`notegen/detail.vue`)：
     - **计费概览**：展示预估点数范围、实际扣除点数、结算状态、总消耗 Token 及扣费类型。
     - **计费明细**：以表格形式展示每个步骤的执行模型、Token 消耗 (P/C/T)、折算点数、执行状态及错误信息。
   - **配置管理** (`notegen/config.vue`)：支持版本化的步骤模型映射配置。修正了模型列表获取接口为 `ApiModels.queryModels`。
4. **规范化调整**：将所有 `noteGen` 相关目录、文件及引用统一调整为小写 `notegen`，修复了 Vite 在 Windows 环境下的路径解析问题。
5. **测试验证**：
   - **UI 访问测试**：成功进入管理端“笔记生成”模块，列表加载正常。
   - **详情审计测试**：针对已结算任务，详情页准确展示了各步骤的 Token 消耗事实及最终扣费总额。
   - **验证通过**。
