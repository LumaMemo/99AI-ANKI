# 20251222cx-bj-preview-第9章路线.md

## 1. 调研当前项目状态

### 1.1 已完成内容
- **API 模块**：[admin/src/api/modules/notegen.ts](admin/src/api/modules/notegen.ts) 已实现，包含配置获取/更新、任务列表、详情及下载签名接口。
- **基础页面结构**：
    - [admin/src/views/notegen/index.vue](admin/src/views/notegen/index.vue) (任务管理列表)
    - [admin/src/views/notegen/config.vue](admin/src/views/notegen/config.vue) (配置管理)
    - [admin/src/views/notegen/detail.vue](admin/src/views/notegen/detail.vue) (任务详情)
- **路由配置**：[admin/src/router/modules/notegen.menu.ts](admin/src/router/modules/notegen.menu.ts) 已定义，但目前作为独立一级菜单。

### 1.2 可复用内容
- 现有的 Element Plus 组件库和布局。
- `utcToShanghaiTime` 等时间格式化工具。
- 已有的 API 调用逻辑。

### 1.3 需要修改/增加内容
- **菜单重构**：按照需求文档，将“笔记生成配置”移至“模型管理”下，将“笔记管理”移至“数据管理”下。
- **配置管理增强**：
    - 扩展 `configJson` 字段，支持 Step 1, 2, 3, 4, 5, 8 的详细参数（如并发、重试、Zoom、分块大小等）。
    - 增加版本号、最后修改人、变更说明的展示。
- **任务列表增强**：
    - 增加 `kbPdfId`、`jobId` 过滤条件。
    - 增加 `pipelineKey`、`configId`、`configVersion` 等审计列。
- **任务详情增强**：
    - 增加“输入 PDF 快照”区块。
    - 增加“存储状态”区块。
    - 增加“错误诊断”区块（错误码、堆栈等）。
    - 在产物列表中增加“下载”按钮。
    - 在步骤用量中增加 `providerCost` 展示。

---

## 2. 开发路线步骤

### Step 1: 菜单结构调整与路由重构 [DONE]
**目标**：将笔记生成相关功能归类到正确的父菜单下。
**修改代码**：
- 修改 [admin/src/router/modules/model.menu.ts](admin/src/router/modules/model.menu.ts)：添加 `config.vue` 路由。
- 修改 [admin/src/router/modules/chat.menu.ts](admin/src/router/modules/chat.menu.ts)：添加 `index.vue` 和 `detail.vue` 路由。
- 修改 [admin/src/router/routes.ts](admin/src/router/routes.ts)：移除 `NoteGenMenu`。
- 修改 [admin/src/views/notegen/index.vue](admin/src/views/notegen/index.vue)：更新详情跳转路径。
- 删除 [admin/src/router/modules/notegen.menu.ts](admin/src/router/modules/notegen.menu.ts)。
**验证脚本**：
- 浏览器访问 Admin 后台，检查左侧菜单：
    - `模型管理` -> `笔记生成配置`
    - `数据管理` -> `笔记管理`
**回滚策略**：恢复 `notegen.menu.ts` 并撤销对 `model.menu.ts`、`chat.menu.ts` 和 `routes.ts` 的修改。

### Step 2: 增强配置管理页面 (`config.vue`) [DONE]
**目标**：支持全量 `configJson` 结构及版本元数据展示。
**修改代码**：
- 修改 [admin/src/views/notegen/config.vue](admin/src/views/notegen/config.vue)：
    - 模板中增加 Step 3 (限制)、Step 5 (整理卡片)、Step 8 (输出) 的配置项。
    - 为 Step 1, 2, 4 增加 `concurrency`, `maxRetries`, `zoom` 等高级参数输入。
    - 增加 `version`, `updatedByAdminId`, `remark` 的只读展示。
    - **优化**：锁定 Step 5 为系统内置不可修改；同步 `.env` 默认模型配置；统一计费类型为“普通积分”。
**验证脚本**：
- 浏览器访问 `模型管理` -> `笔记生成配置`，检查参数排版及默认值。
**回滚策略**：使用 Git 丢弃对 `config.vue` 的修改。

### Step 3: 增强任务列表页面 (`index.vue`) [DONE]
**目标**：提供更强大的过滤和审计能力。
**修改代码**：
- 修改 [admin/src/views/notegen/index.vue](admin/src/views/notegen/index.vue)：
    - `queryForm` 增加 `kbPdfId`, `jobId` 字段。
    - 表格增加 `kbPdfId`, `pipelineKey`, `configVersion` 列。
**验证脚本**：
- 在列表页输入特定的 `jobId` 或 `kbPdfId` 进行搜索，验证过滤结果。
- `curl -H "Authorization: Bearer <TOKEN>" "http://localhost:3000/admin/note-gen/jobs?jobId=xxx&kbPdfId=yyy"`
- **测试结果**：通过。已验证过滤功能和新增列的展示。
**回滚策略**：撤销对 `index.vue` 的修改。

### Step 4: 完善任务详情页面 (`detail.vue`) [DONE]
**目标**：实现全量审计信息展示与产物下载。
**修改代码**：
- 修改 [admin/src/views/notegen/detail.vue](admin/src/views/notegen/detail.vue)：
    - **已完成**：统一计费类型为“普通积分”；为 Token 消耗 (P/C/T) 增加 Tooltip 注释。
    - **已完成**：增加 `PDF 快照` 描述列表（Bucket, Region, Key, Etag, Size）。
    - **已完成**：增加 `存储与清理` 描述列表（Prefix, UploadStatus, CleanupAt）。
    - **已完成**：增加 `错误诊断` 区块（展示 `lastErrorCode`, `lastErrorMessage`, `lastErrorAt`, `lastErrorStack`）。
    - **已完成**：产物表格增加“下载”操作列，调用 `ApiNoteGen.getSignedUrl`。
    - **已完成**：在步骤用量中增加 `providerCost` 展示。
**验证脚本**：
- 点击产物列表中的“下载”按钮，验证是否能获取到 COS 签名链接并触发下载。
- 检查详情页各新增区块的数据展示是否正确。
**回滚策略**：使用 Git 丢弃对 `detail.vue` 的修改。

### Step 5: UI 细节优化与联调 [DONE]
**目标**：确保整体交互流畅，错误提示友好，前后端参数传递准确。
**修改代码**：
- **Admin 端优化**：
    - 修改 [admin/src/views/notegen/config.vue](admin/src/views/notegen/config.vue)：将模型选择绑定值从 `modelName` (显示名) 修正为 `model` (绑定标识)，确保配置参数与后端/Worker 兼容。
    - 修改 [admin/src/views/notegen/detail.vue](admin/src/views/notegen/detail.vue)：优化了 Loading 状态，确保 `utcToShanghaiTime` 应用于所有时间字段。
- **后端 Service 增强**：
    - 修改 [service/src/modules/noteGen/noteGen.service.ts](service/src/modules/noteGen/noteGen.service.ts)：
        - `getJobDetail` 改为返回全量 Job 字段（使用 `...job`），支持详情页的审计信息展示。
        - 统一产物列表字段名为 `artifacts`，并确保大数字字段（如 `sizeBytes`）转换为 Number 类型。
- **Worker 联调修复**：
    - 修改 [pdf_to_anki/src/api/main.py](pdf_to_anki/src/api/main.py)：
        - 修复了 Step 8 产物输出开关被硬编码为 true 的问题，现在严格遵循 Admin 配置。
        - 补齐了 Step 1, 2, 3, 4 的所有高级参数（并发、重试、缩放、分块、限制等）从 `configSnapshot` 到环境变量的映射。
**验证脚本**：
- 模拟 API 报错，检查 UI 是否弹出正确的错误提示。
- 验证不同配置下的产物生成数量是否符合预期。
**回滚策略**：无。

---

## 3. 任务完成总结 (第 9 章：Admin 侧功能移植)

本章节已全部完成，实现了从配置管理、任务监控到产物审计的全链路功能。

**核心交付物：**
1.  **配置中心**：支持版本化的笔记生成参数配置，支持模型绑定映射。
2.  **任务中心**：支持多维度过滤的任务列表，以及包含 PDF 快照、计费明细、错误诊断的深度详情页。
3.  **产物中心**：支持 COS 签名下载，支持按配置动态生成不同格式的笔记。
4.  **联调闭环**：确保了 Admin -> NestJS -> Python Worker 的参数传递 100% 对齐。

---

## 4. 关键回滚策略
- **代码层面**：所有修改均在 Git 分支上进行，若出现重大逻辑错误，直接 `git checkout .` 或回滚特定 commit。
- **数据层面**：Admin 端主要为只读操作（除配置更新外）。配置更新采用版本化存储（新建记录），若新配置导致问题，可通过数据库手动将旧版本 `enabled` 置为 `true` 快速回滚。
