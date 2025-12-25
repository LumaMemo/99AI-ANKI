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

### 步骤 10.3：Footer 触发按钮（NoteGenPill）
**目标**：在 Chat 输入框上方增加“生成笔记”按钮，采用 iOS App 风格图标。

- **修改代码**：
  - 修改 `chat/src/views/chat/components/Footer/index.vue`：
    - 引入 `Notes` 或自定义 iOS 风格图标。
    - 在 `shouldShowMermaidTool` 之后增加 `NoteGenPill` 块。
    - **UI 要求**：采用 iOS App 风格的图标设计（Squircle 圆角矩形、微阴影、毛玻璃背景或渐变色）；在排版缩小（移动端）时，图标应保持可见并适当缩放，不被隐藏。
    - **功能要求**：默认生成 2 种形式（Markdown/Markmap 和 Word）。
    - 点击逻辑：
      1. 检查 `selectedKbPdfId`，若无则弹出 Toast 提示“请先在知识库中选择一个 PDF”。
      2. 调用 `POST /note-gen/jobs`。
      3. 若返回 400（余额不足），弹出充值提示。
      4. 若成功，将返回的 `jobId` 存入 Store 并开启轮询。
- **验证脚本**：
  - 未选 PDF 时点击：提示“请先选择 PDF”。
  - 已选 PDF 时点击：观察 Network 面板是否发出 `POST /note-gen/jobs` 请求。
  - 缩放浏览器窗口：确认图标在小屏幕下依然存在且排版正常。

### 10.4：进度轮询与 6 段进度条展示
**目标**：实时展示任务进度，并处理“退出重进”的进度恢复。

- **修改代码**：
  - 修改 `chat/src/views/chat/chatBase.vue` 或 `Message/index.vue`：
    - 增加一个特殊的“系统消息卡片”或“顶部浮层”展示进度。
    - 进度条逻辑：`progressPercent` 映射到 6 段 UI（16.6% 步进）。
    - 轮询逻辑：`setInterval` 每 60 秒调用一次 `GET /note-gen/jobs/:jobId`。
    - 状态映射：`processing` 展示进度条；`failed/incomplete` 展示错误文案与“重试”按钮。
- **验证脚本**：
  - 发起任务后，观察 UI 是否出现进度条。
  - 手动修改数据库 `progressPercent` 为 33，观察前端是否跳到第二段。

### 10.5：结果下载笔记
**目标**：任务完成后，交付 Markdown 和 Word 下载链接。

- **修改代码**：
  - 修改进度展示组件：当 `status === 'completed'` 时，切换为“下载笔记”模式。
  - 展示两个按钮：`[下载 Markdown/思维导图]`、`[下载 Word 笔记]`。
  - 点击下载逻辑：
    1. 调用 `GET /note-gen/jobs/:jobId/files/:type/signed-url`。
    2. 拿到 URL 后，使用 `window.open(url)` 或创建 `<a>` 标签触发下载。
- **验证脚本**：
  - 任务完成后，点击下载按钮。
  - 预期：浏览器开始下载对应的 `.md` 或 `.docx` 文件。

---

## 3. 关键代码修改清单

| 文件路径 | 修改内容 |
| :--- | :--- |
| `src/api/noteGen.ts` | 新增 3 个核心接口函数 |
| `src/store/modules/chat/index.ts` | 增加 `selectedKbPdfId` 状态及 `createNoteGenJob` action |
| `src/views/chat/components/sider/KnowledgeBaseReadonly.vue` | 增加 PDF 选择交互 |
| `src/views/chat/components/Footer/index.vue` | 增加“生成笔记”Pill 按钮及触发逻辑 |
| `src/views/chat/components/Message/NoteGenCard.vue` | (新增) 专门用于展示进度与下载的卡片组件 |

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
1. 登录后打开左侧“知识库”。
2. 点击一个 PDF 旁边的“选择”图标。
3. 在 Chat Footer 看到“生成笔记”按钮变为可用状态。
4. 点击按钮，观察聊天区域是否出现“正在生成笔记 (16%)”的卡片。
5. 等待（或手动修改 DB 状态为 completed），确认出现下载按钮。

---

## 5. 回滚策略

- **UI 回滚**：若新 Pill 按钮导致布局错乱，通过 `v-if` 开关紧急关闭该功能入口。
- **状态回滚**：若轮询导致页面卡顿，降低轮询频率（如从 60s 改为 120s）或改为仅手动刷新。
- **数据回滚**：若 `selectedKbPdfId` 导致 Store 报错，清理 LocalStorage 中的 `chat-store` 缓存。
