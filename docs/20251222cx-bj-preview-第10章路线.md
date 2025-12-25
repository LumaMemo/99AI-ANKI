# 99AI-ANKI：Chat 端（前端）开发路线步骤（第 10 章）

> 文档目的：基于 `20251221cx-bj-preview.md` 方案，为第 10 章“Chat 端需求（前端实现）”设计详细的开发路线。
> 目标：在 Chat 界面实现“选择 KB PDF → 发起生成 → 进度轮询 → 结果下载”的完整闭环。

---

## 1. 现状调研与复用分析

### 1.1 当前已完成

- **Chat Footer 基础设施**：已存在 `usingNetwork`、`usingDeepThinking` 等 pill 按钮及其样式（`btn-pill`）。
- **知识库（KB）管理**：已实现 `KnowledgeBaseReadonly.vue` 抽屉，支持 PDF 列表展示、上传、重命名、删除。
- **后端 API 契约**：第 5 章已定义 `/note-gen` 系列接口。
- **图标库**：已引入 `@icon-park/vue-next`。

### 1.2 可复用部分

- **UI 样式**：复用 `Footer/index.vue` 中的 pill 按钮布局与动画。
- **KB 列表**：复用 `KnowledgeBaseReadonly.vue` 的文件加载逻辑。
- **状态管理**：复用 `chatStore` 进行全局状态同步。

### 1.3 需要添加/修改

- **Store 扩展**：在 `chatStore` 中新增 `selectedKbPdfId`（当前选中的 PDF）和 `activeNoteGenJob`（当前正在运行的任务）。
- **KB 交互修改**：在 KB 抽屉的 PDF 列表中增加“选择”动作，将 PDF ID 存入 Store。
- **新 API 模块**：新增 `src/api/noteGen.ts`。
- **新组件**：
  - `NoteGenPill`：Footer 中的触发按钮（iOS 风格图标，支持响应式缩小）。
  - `NoteGenStatusCard`：在聊天区域展示进度条（6 段式）与下载笔记区域。

---

## 2. 详细开发步骤

### 步骤 10.1：API 定义与 Store 状态初始化 (已完成)

**目标**：建立前端与后端的通信桥梁，并准备好状态存储。

- **修改代码**：
  - 新建 `src/api/noteGen.ts`：定义 `fetchCreateNoteGenJob`, `fetchNoteGenJobDetail`, `fetchNoteGenFileSignedUrl`。
  - 修改 `src/typings/chat.d.ts`：在 `ChatState` 中增加 `selectedKbPdfId?: number`, `selectedKbPdfName?: string`, `activeNoteGenJob?: any`。
  - 修改 `src/store/modules/chat/index.ts`：增加 `setSelectedKbPdf`, `createNoteGenJob`, `syncNoteGenJobStatus` actions。
- **验证脚本**：
  - 检查 `src/api/noteGen.ts` 是否正确导出函数。
  - 在 Vue Devtools 中确认 `chatStore` 状态已初始化。
  - **自检**：无新依赖，兼容旧数据，无安全隐患。

### 步骤 10.2：KB PDF 选择逻辑实现 (已完成)

**目标**：允许用户从知识库中“点选”一个 PDF 作为生成目标。

- **修改代码**：
  - 修改 `KnowledgeBaseReadonly.vue`：
    - 在 PDF 列表项增加“选择”按钮（或点击整行触发）。
    - 点击后调用 `chatStore.setSelectedKbPdf(f.id, f.displayName)`。
    - 选中状态在 UI 上给予高亮反馈。
- **验证脚本**：
  - 打开 KB 抽屉，点击一个 PDF 的“选择”按钮。
  - 预期：抽屉关闭（或提示已选中），Store 中的 `selectedKbPdfId` 变为该文件 ID。

### 步骤 10.3：触发按钮和新笔记界面 (已完成)

**目标**：入口不放在 Footer pill 区域；改为“新对话页（Chat 主容器 glass-card）左上角”的一个独立 App 图标入口。点击后进入“笔记生成专用新页面”，在该页面内完成配置、发起任务、轮询、下载（10.3~10.5 都在同一页）。

- **改动原则（强约束）**：

  - **入口位置**：放在 `chatBase.vue` 的主容器 `glass-card relative overflow-hidden h-full w-full flex flex-col transition-all duration-300 ease-in-out transform` 这一层内的左上角（绝对定位覆盖在内容上方）。
  - **独立页面**：笔记生成页与当前对话页**分离**；不会把进度卡片塞回消息流（不改 Message 列表渲染）。
  - **不与“图表/深度思考/联网”同一组**：不放在 Footer 的 pill 工具区。
- **修改代码**：

  1. 路由结构（已按现状落地）：
    - `chat/src/utils/router.ts` 使用**嵌套路由**：`/` 作为布局容器（`chat.vue`），子路由 `''` 为聊天页（`chatBase.vue`），`note-gen` 为笔记生成页（`noteGen/index.vue`）。
    - 这样笔记生成页与聊天页**同布局同尺寸**，并共享左侧历史侧栏。

  2. 新入口组件（已按现状落地）：
    - 在 `chat/src/views/chat/chatBase.vue` 的 glass-card 容器内加入 `NoteGenAppIcon`（iOS App 风格）。
    - 点击行为：尽力创建/激活一个“笔记生成”对话组（让它立刻出现在左侧历史），然后 `router.push('/note-gen')`。

  3. 笔记生成专用页面（已按现状落地）：
    - `chat/src/views/noteGen/index.vue` 展示“已选择的 PDF 信息”（名称/ID）与“固定配置”。
    - 若未选 PDF，会自动打开知识库抽屉，方便选择；并提供“开始生成笔记”按钮。
    - 右上角补齐与聊天页一致的“主题切换 + 新建对话”（复用布局层提供的 `createNewChatGroup`）。

  4. 知识库抽屉控制（为满足 10.3 的自动弹出而做的工程化改动）：
    - `KnowledgeBaseReadonly.vue` 的 `visible` 状态提升到 `globalStore.showKnowledgeBase`，并 Teleport 到 `body`，避免层级/transform 导致遮罩不生效。
    - 为了符合“进入笔记生成页不应自动刷接口”的体验，知识库数据加载改为**抽屉打开时再加载**（lazy-load）。
- **开始生成按钮逻辑（在笔记生成页内）**：

  1. 若 `selectedKbPdfId` 不存在：Toast 提示“请先在知识库中选择一个 PDF”，并保持/再次打开知识库侧边栏。
  2. 调用 `POST /note-gen/jobs`（`kbPdfId` + `pageRange:{mode:'all'}`）。
  3. 若返回 400（余额不足门槛）：弹出充值提示。
  4. 成功：将 `jobId` 写入 Store（`activeNoteGenJob`），并进入轮询阶段（10.4）。
- **验证脚本**：

  - 打开一个“新对话页”，确认左上角出现“笔记生成 App 图标”。
  - 点击图标：进入笔记生成专用页面；若未选择 PDF，页面会自动打开知识库抽屉。
  - 不选 PDF 直接点“开始生成”：提示“请先在知识库中选择一个 PDF”。
  - 选中 PDF 后点击“开始生成”：Network 发出 `POST /note-gen/jobs`。
  - 缩放浏览器/切换移动端：图标仍可见且不遮挡核心交互。

> 说明：进入笔记生成页可能会触发“创建/同步对话组、拉历史聊天记录”等请求（用于左侧历史与状态恢复），但不会触发 `POST /note-gen/jobs`；真正的生成任务只在点击“开始生成笔记”时发起。

### 10.4：进度轮询与 6 段进度条展示 (已完成)

**目标**：进度展示只在“笔记生成专用页面”内渲染；支持“退出重进”恢复（重新进入专用页能继续看到并轮询同一个 job）。

- **修改代码**：

  - 在笔记生成专用页面新增 `NoteGenStatusCard`（或同名组件）：
    - 进度条：6 段式（每段 16.6% 视觉步进），仅展示 0~100% 数字，不暴露内部步骤含义。
    - 状态映射：
      - `processing/created`：显示进度条与“手动刷新”按钮。
      - `failed/incomplete`：显示后端 `userMessage`（若有）与“重试/再次发起生成”按钮（重试语义：再次调用创建任务接口，后端幂等/断点续跑接管）。
    - 手动刷新 UX（本次补齐）：
      - 用户点击刷新后，**必须有“刷新成功”提示**（toast）。
      - “刷新中”只在请求进行中显示转圈/禁用，**请求结束立刻停止**，不允许一直转圈。
    - **后台运行提示**：在处理中状态下，增加明确提示告知用户任务在后台运行，可以离开页面。
    - **PDF 选择锁定**：一旦任务发起（`activeJob` 存在），顶部的“重新选择”按钮将被隐藏并显示“已锁定”状态，防止在生成过程中意外更改目标 PDF。
    - **UI 修复**：对 PDF 名称进行 `decodeURIComponent` 处理，并增加 `truncate` 样式解决长文件名溢出容器的问题。
  - 轮询逻辑：
    - 在专用页 `onMounted`：若存在 `activeNoteGenJob.jobId`，立即拉一次 `GET /note-gen/jobs/:jobId`。
    - 自动轮询：`setInterval` 每 60 秒刷新一次；离开页面 `onUnmounted` 清理定时器。
    - 手动刷新：立即触发一次 `GET`。
    - 轮询错误处理（本次补齐）：
      - 自动轮询请求走 `silent`（best-effort），避免偶发错误打扰用户。
      - 手动刷新请求不 silent，失败需要提示原因。

  - ⚠️ 联调修复（本次实际踩坑记录）：
    - **避免 304 Not Modified 导致“刷新无反馈”**：后端对 `GET /note-gen/jobs/:jobId` 返回了 ETag，浏览器会携带 `If-None-Match` 导致 304 无 body，从而前端状态不更新。
      - 处理方式：前端在请求上追加 cache-bust query（如 `_t=Date.now()`），确保每次刷新/轮询拿到最新 body。
    - **兼容后端返回结构差异**：部分环境可能直接返回 DTO（不包 `{ code, data }`）。
      - 处理方式：Store 层做 unwrap，支持“包装/非包装”两种响应体。
    - **F5 刷新状态丢失与重定向问题**：
      - 问题：刷新页面时 `groupList` 为空导致 `activeConfig` 失效，触发 `chat.vue` 重定向到首页，且 `noteGen` 页面状态重置弹出知识库。
      - 处理方式：修改 `chatStore` 的 `setLocalState` 逻辑，将 `groupList`、`selectedKbPdfId`、`activeNoteGenJob` 等关键状态持久化到 LocalStorage，确保刷新后立即恢复上下文。
- **验证脚本**：

  - 在专用页发起任务后，确认出现 6 段进度条。
  - 手动刷新：确认会触发一次 `GET /note-gen/jobs/:jobId`。
  - 退出专用页再进入：进度仍可恢复展示，并继续轮询。
  - 手动修改 DB `progressPercent=33`：前端进度条应跳到第 2 段。

### 10.5：结果下载笔记 (已完成)

**目标**：下载交付只在“笔记生成专用页面”内完成；完成态展示两个下载按钮（Markdown/Markmap 与 Word）。

- **修改代码**：

  - 在 `NoteGenStatusCard` 中，当 `status === 'completed'` 时切换到“下载笔记”模式：
    - 展示两个按钮：`[下载 Markdown/思维导图]`、`[下载 Word 笔记]`。
    - 点击下载逻辑（与第 5 章契约对齐）：
      1. 调用 `GET /note-gen/jobs/:jobId/files/:fileType/signed-url`（`fileType` 为 `markdown-markmap` 或 `word`）。
      2. 拿到 `{ url }` 后，使用 `window.open(url)` 或创建 `<a>` 标签触发下载。
  - 注意：`GET /note-gen/jobs/:jobId` 不返回签名 URL，避免轮询导致 URL 过期/浪费。
- **验证脚本**：

  - 将 job 状态置为 `completed` 且 artifacts ready：专用页出现两个下载按钮。
  - 点击下载：Network 先请求 signed-url，随后浏览器开始下载 `.md` 或 `.docx`。

---

## 3. 关键代码修改清单

| 文件路径                                                      | 修改内容                                                    |
| :------------------------------------------------------------ | :---------------------------------------------------------- |
| `src/api/noteGen.ts`                                        | 新增 3 个核心接口函数                                       |
| `src/store/modules/chat/index.ts`                           | 增加 `selectedKbPdfId` 状态及 `createNoteGenJob` action |
| `src/views/chat/components/sider/KnowledgeBaseReadonly.vue` | 增加 PDF 选择交互；抽屉可全局打开；打开时再加载（lazy-load） |
| `chat/src/utils/router.ts`                                  | 嵌套路由：`chat.vue` 布局 + 子路由 `Chat`/`NoteGen`         |
| `chat/src/views/chat/chat.vue`                              | 作为布局容器承载 Sider + `<router-view>`；按激活组自动切换 `/note-gen` |
| `chat/src/views/chat/chatBase.vue`                          | 在 glass-card 左上角增加“笔记生成 App 图标”入口             |
| `chat/src/views/chat/components/NoteGenAppIcon.vue`         | (新增) App 图标入口组件，点击跳转 `/note-gen`               |
| `chat/src/views/noteGen/index.vue`                          | (新增) 笔记生成专用页面：配置/开始生成/轮询/下载闭环 + 右上角按钮 |
| `chat/src/views/noteGen/components/NoteGenStatusCard.vue`   | (新增) 6 段进度条 + 下载按钮                                |
| `chat/src/utils/request/index.ts`                           | 支持 `silent`：用于“非关键并行请求失败不误报全局 toast”     |

---

## 4. 验证方法

### 4.1 接口测试 (Curl)

```bash
# 模拟创建任务 (需替换 JWT Token 和 kbPdfId)
curl -X POST http://localhost:3000/api/note-gen/jobs \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"kbPdfId": 1, "pageRange": {"mode": "all"}}'
```

### 4.2 UI 交互测试

1. 打开一个“新对话页”，点击左上角“笔记生成 App 图标”，进入笔记生成专用页面。
2. 进入后自动弹出左侧“知识库”，选择一个 PDF。
3. 在专用页点击“开始生成笔记”，观察是否发出 `POST /note-gen/jobs`。
4. 专用页出现 6 段进度条；等待（或手动修改 DB）观察进度更新。
5. 状态为 completed 后，专用页出现两个下载按钮，点击可下载 `.md` 与 `.docx`。

---

## 5. 回滚策略

- **UI 回滚**：若新 Pill 按钮导致布局错乱，通过 `v-if` 开关紧急关闭该功能入口。
- **状态回滚**：若轮询导致页面卡顿，降低轮询频率（如从 60s 改为 120s）或改为仅手动刷新。
- **数据回滚**：若 `selectedKbPdfId` 导致 Store 报错，清理 LocalStorage 中的 `chat-store` 缓存。
