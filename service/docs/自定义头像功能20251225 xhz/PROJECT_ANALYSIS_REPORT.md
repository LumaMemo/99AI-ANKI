# 99AI-ANKI 项目结构与功能分析报告

## 1. 项目概览

**项目名称**: 99AI-ANKI
**基础框架**: 基于 [99AI](https://github.com/vastxie/99AI) 开源项目二次开发。
**核心变更**: 在原有 AI 服务平台基础上，新增了**知识库 (Knowledge Base, KB)** 功能，涵盖了从后端存储、管理端配置到前端展示的全链路实现。

### 目录结构概览
```text
/99AI-ANKI
├── admin/                 # 管理后台前端 (Vue 3 + Element Plus)
├── chat/                  # 用户聊天前端 (Vue 3 + TailwindCSS)
├── service/               # 后端服务 API (NestJS + TypeORM)
├── AIWebQuickDeploy/      # 快速部署脚本与配置 (Docker)
├── docs/                  # 项目文档 (包含详细的 KB 设计方案)
└── README.md              # 原项目说明
```

---

## 2. 技术栈分析

### 2.1 Admin (管理后台)
*   **路径**: `/admin`
*   **框架**: Vue 3, Vite
*   **UI 组件库**: Element Plus
*   **状态管理**: Pinia
*   **主要职责**: 系统配置、用户管理、套餐管理、模型配置。
*   **关键改动**: `views/package/package.vue` 已修改，支持在套餐中配置“知识库空间”配额 (`kbQuotaBytes`)。

### 2.2 Chat (用户前端)
*   **路径**: `/chat`
*   **框架**: Vue 3, Vite
*   **样式库**: TailwindCSS
*   **核心库**: `markdown-it`, `highlight.js`, `katex`, `codemirror` (代码编辑/展示)。
*   **主要职责**: AI 对话交互、绘画生成、知识库管理。
*   **关键改动**: `views/chat/components/sider/` 下包含知识库相关组件 (e.g., `KnowledgeBaseReadonly.vue`)，实现了侧边栏的知识库文件树与列表展示。

### 2.3 Service (后端 API)
*   **路径**: `/service`
*   **框架**: NestJS (Node.js)
*   **数据库**: MySQL (TypeORM), Redis (缓存/队列)
*   **存储**: 腾讯云 COS (根据设计文档与依赖 `cos-nodejs-sdk-v5`)
*   **主要职责**: 业务逻辑处理、模型调用转发、支付回调、文件存储。
*   **关键改动**: 新增 `modules/kb` 模块，包含：
    *   **Controller**: `kb.controller.ts` (API 接口)
    *   **Service**: `kb.service.ts` (业务逻辑)
    *   **Entities**:
        *   `kbFolder.entity.ts`: 文件夹结构树
        *   `kbPdf.entity.ts`: PDF 文件记录
        *   `kbUserUsage.entity.ts`: 用户用量统计

---

## 3. 核心功能：知识库 (Knowledge Base)

根据 `docs/20251217cxkb设计方案.md` 及代码审计，该功能实现了以下闭环：

1.  **存储层 (Service)**:
    *   文件上传至腾讯云 COS（私有读写 Bucket）。
    *   数据库记录文件元信息及文件夹层级结构。
    *   实现了用户空间配额管理 (`KbUserUsage`)。

2.  **管理层 (Admin)**:
    *   在“套餐管理”中新增了 `知识库空间` 配置项。
    *   管理员可为不同等级的 VIP 套餐分配不同的存储空间 (MB/GB)。

3.  **应用层 (Chat)**:
    *   用户界面左侧/顶部常驻知识库入口。
    *   支持文件夹创建、重命名、删除。
    *   支持 PDF 上传、列表展示与预览（通过后端签名 URL）。

---

## 4. 启动与开发指南

### 前置要求
*   Node.js >= 18
*   pnpm (推荐 v9+)
*   MySQL 5.7/8.0
*   Redis

### 启动步骤

1.  **后端 (Service)**
    ```bash
    cd service
    pnpm install
    # 配置 .env 文件 (数据库、Redis、COS 密钥等)
    pnpm dev
    ```

2.  **管理端 (Admin)**
    ```bash
    cd admin
    pnpm install
    pnpm dev
    # 访问: http://localhost:xxxx (查看 vite 输出)
    ```

3.  **用户端 (Chat)**
    ```bash
    cd chat
    pnpm install
    pnpm dev
    # 访问: http://localhost:xxxx
    ```

### 部署建议
参考 `AIWebQuickDeploy/docker-compose.yml`，项目支持 Docker 容器化部署。需重点关注 `nginx` 配置以正确转发 `/api` 请求到后端服务。

---

## 5. 待办与建议 (基于现状分析)

1.  **文档补全**: 虽然有详细的设计文档，但缺乏具体的 API 接口文档 (Swagger 可能已自动生成，需确认 `/api/doc`)。
2.  **测试验证**: 建议重点测试“知识库配额”逻辑，确保用户上传大文件时能正确拦截超额请求。
3.  **安全性**: 检查 `kb.controller.ts` 中的文件下载/预览接口，确保严格校验了文件所有权 (`userId`)，防止越权访问私有文件。
