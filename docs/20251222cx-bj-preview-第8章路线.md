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
| **Step 2** | [新增] Backend：结算接口实现 | 实现 `charge-job` 接口，计算总价并执行扣费 | 任务完工后一次性扣费成功                 |
| **Step 3** | [补丁-第6章] Worker：结算触发集成 | 完工后调用后端结算接口发送信号             | Worker 完工后触发后端扣费                |
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

