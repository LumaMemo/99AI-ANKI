# 99AI-ANKI 项目构建错误修复记录 (2025-12-26)

本文档记录了为解决 GitHub Actions 部署失败而进行的生产环境构建错误修复。

## 1. 修复背景
在 GitHub Actions 部署过程中，生产环境构建 (`pnpm build`) 触发了严格的 TypeScript 类型检查和 Vue 模板编译校验，导致构建失败。主要错误包括：
- `Property 'model' does not exist on type 'never'`
- `Type '""' is not assignable to type 'EpPropMergeType<...>'`
- `Error parsing JavaScript expression: Unexpected token, expected ","`

## 2. 修改内容详情

### 2.1 Admin 模块 (TypeScript 类型修复)

#### [admin/src/views/notegen/config.vue](../admin/src/views/notegen/config.vue)
- **问题**: `models` 变量被推断为 `never[]`；`steps` 对象索引类型不匹配。
- **修复**: 
    - 将 `models` 定义改为 `ref<any[]>([])`。
    - 将 `steps` 对象强制转换为 `as any`，允许动态字符串键访问。

#### [admin/src/views/notegen/detail.vue](../admin/src/views/notegen/detail.vue)
- **问题**: `el-tag` 的 `type` 属性不接受空字符串。
- **修复**: 
    - 为 `getStatusType` 和 `getStepStatusType` 添加了显式的返回类型定义：`'success' | 'info' | 'warning' | 'danger' | 'primary'`。
    - 确保默认返回 `'info'` 而不是空字符串。

#### [admin/src/views/notegen/index.vue](../admin/src/views/notegen/index.vue)
- **问题**: `el-progress` 的 `status` 属性类型错误。
- **修复**: 
    - 将 `status` 的默认空字符串改为 `undefined`。
    - 同步更新了 `getStatusType` 的返回类型。

### 2.2 Chat 模块 (Vue 模板解析与语法修复)

#### [chat/src/views/noteGen/index.vue](../chat/src/views/noteGen/index.vue)
- **问题**: 模板中复杂的内联 JS 表达式导致 Vite 编译器报错。
- **修复**: 
    - **逻辑下沉**: 将 `@click` 中的复杂逻辑移至 `<script>` 块中的 `handleReset` 和 `handleCreateNewChat` 方法。
    - **样式优化**: 移除了模板中的 `text-[color:var(...)]` 语法，改为在 `<style scoped>` 中定义自定义类名（如 `.text-primary-custom`），提高构建兼容性。

#### [chat/src/views/noteGen/components/NoteGenStatusCard.vue](../chat/src/views/noteGen/components/NoteGenStatusCard.vue)
- **问题**: 进度条状态判断逻辑过于复杂。
- **修复**: 
    - **计算属性**: 引入 `statusLabel` 处理状态文字。
    - **方法封装**: 引入 `getSegmentClass` 处理进度条颜色逻辑。
    - **样式优化**: 将内联 CSS 变量绑定移至 Scoped CSS。

## 3. 核心文档检查
本次修复**未修改**以下核心文档：
- `99AI-ANKI/README.md`
- `99AI-ANKI/20251214cx运行指南.md`
- `SYNC_PROTOCOL_REVIEW_FLOW.md`
- 任何 `LICENSE` 或协议文件。

## 4. 建议
在提交代码前，建议在本地对应目录下运行 `pnpm build` 进行预校验，以确保符合生产环境的严格构建标准。
