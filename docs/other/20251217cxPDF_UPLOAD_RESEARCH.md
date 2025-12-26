# 99AI-ANKI 上传 PDF 功能调研

> 目标：搞清楚“上传 PDF 的接口在哪、是否落库记录用户上传信息、10MB 限制在哪里、是否必须配置 COS”，并把前端/后端/admin 三端的链路串起来。

## TL;DR（结论先说）

- **上传接口**：后端由 `UploadController` 提供 `POST /api/upload/file`（需要登录 JWT）。见：
  - [service/src/modules/upload/upload.controller.ts](../service/src/modules/upload/upload.controller.ts)
- **大小限制**：后端在 `FileInterceptor` 里硬限制 **10MB**（multer 的 `limits.fileSize`）。见：
  - [service/src/modules/upload/upload.controller.ts](../service/src/modules/upload/upload.controller.ts)
- **COS 是否必须**：
  - **不是必须**。只要在后台开启 **本地存储**（`localStorageStatus=1`）并设置 `siteUrl`，即可把文件落在服务端 `public/file` 并通过 `/file/...` 访问。
  - 但如果 **本地/S3/COS/OSS/Chevereto 全部都没开启**，上传会直接报错“未配置任何上传方式”。见：
    - [service/src/modules/upload/upload.service.ts](../service/src/modules/upload/upload.service.ts)
- **是否有数据库记录用户上传 PDF**：
  - 没有看到单独的“用户 PDF 表”或“上传记录表”。上传接口只返回 URL。
  - 但会在业务表里留下“文件链接”的记录：
    - `chat_group.fileUrl`：保存当前对话组绑定的文件列表（JSON 字符串）。见：[service/src/modules/chatGroup/chatGroup.entity.ts](../service/src/modules/chatGroup/chatGroup.entity.ts)
    - `chatlog.fileUrl`：聊天记录里也有 `fileUrl` 字段（文本）。见：[service/src/modules/chatLog/chatLog.entity.ts](../service/src/modules/chatLog/chatLog.entity.ts)
- **PDF 文本提取**：后端引入了 `pdf-parse`，并且 `chat_group` 表里有 `pdfTextContent` 字段，但当前代码里**没有任何地方写入 `pdfTextContent`**（只有读取/字段存在，提取逻辑也未被实际调用）。

---

## 1. 端到端链路（上传 PDF 到聊天使用）

### 1.1 Chat 前端（用户端）

1) 用户在聊天输入框点“上传/附件”。
2) 组件根据当前模型能力决定允许上传类型（文件/图片/两者）：
   - 见：[chat/src/views/chat/components/Footer/index.vue](../chat/src/views/chat/components/Footer/index.vue)
3) 选择 PDF 后：
   - **非图片文件**会“选择后立即上传”，调用 `uploadFile(file)`。
   - 上传成功返回一个 URL，然后把 `{name,url,type:'document'}` 追加到对话组 `fileUrl`（JSON 数组字符串），并调用 `chatStore.updateGroupInfo` 写回后端。
4) 发送消息时：把当前对话组的 `fileUrl`（JSON 字符串）作为 `fileUrl` 字段带到 `onConversation` 请求里。

对应代码：
- 上传 API： [chat/src/api/upload.ts](../chat/src/api/upload.ts)
- 上传调用与对话组持久化： [chat/src/views/chat/components/Footer/index.vue](../chat/src/views/chat/components/Footer/index.vue)

### 1.2 Service 后端（NestJS）

1) `POST /api/upload/file` 接收 multipart 的 `file` 字段。
2) `UploadService.uploadFile()` 根据后台配置决定存储后端（本地/S3/COS/OSS/Chevereto），返回“可访问 URL”。
3) 前端把这个 URL 写到对话组 `chat_group.fileUrl`（通过对话组更新接口，非 upload 接口自己落库）。

对应代码：
- 上传 controller： [service/src/modules/upload/upload.controller.ts](../service/src/modules/upload/upload.controller.ts)
- 上传 service（多存储后端选择）： [service/src/modules/upload/upload.service.ts](../service/src/modules/upload/upload.service.ts)

---

## 2. 后端实现细节

### 2.1 上传接口定义

- 路由：`@Controller('upload')` + `@Post('file')` => `POST /api/upload/file`
- 鉴权：`@UseGuards(JwtAuthGuard)`，所以必须带 `Authorization: Bearer <token>`
- 大小：multer `limits.fileSize = 10 * 1024 * 1024`

文件：
- [service/src/modules/upload/upload.controller.ts](../service/src/modules/upload/upload.controller.ts)

### 2.2 存储后端选择逻辑（本地 / S3 / COS / OSS / Chevereto）

`UploadService.uploadFile()` 会先读全局配置：
- `localStorageStatus` / `s3Status` / `tencentCosStatus` / `aliOssStatus` / `cheveretoStatus`

选择优先级（代码顺序）：
- **本地存储 > S3 > 腾讯云 COS > 阿里云 OSS > Chevereto**

如果全部关闭：直接抛 `HttpException('请先前往后台配置上传图片的方式')`

文件：
- [service/src/modules/upload/upload.service.ts](../service/src/modules/upload/upload.service.ts)

### 2.3 本地存储落盘与静态访问

- 落盘目录：`<service>/public/file/<dir>/<filename>`
- 返回 URL：默认返回 `file/<dir>/<filename>`，若后台配置了 `siteUrl`，会返回 `siteUrl/file/<dir>/<filename>`
- 静态访问：`ServeStaticModule` 显式把 `public/file` 挂载到 `/file`，并设置了跨域 header。

文件：
- 静态挂载： [service/src/app.module.ts](../service/src/app.module.ts)
- 本地保存： [service/src/modules/upload/upload.service.ts](../service/src/modules/upload/upload.service.ts)

### 2.4 COS/S3/OSS 配置来源（不是 .env，而是数据库 config 表）

上传配置来自 `GlobalConfigService.getConfigs([...])`，数据源是数据库的 `config` 表（`ConfigEntity`）：
- key: `configKey`
- val: `configVal`

COS 所需关键配置 key：
- `tencentCosStatus`
- `cosSecretId` / `cosSecretKey`
- `cosBucket` / `cosRegion`
- 可选：`tencentCosAcceleratedDomain`

文件：
- 配置表实体： [service/src/modules/globalConfig/config.entity.ts](../service/src/modules/globalConfig/config.entity.ts)
- 配置读取/写入： [service/src/modules/globalConfig/globalConfig.service.ts](../service/src/modules/globalConfig/globalConfig.service.ts)

### 2.5 上传频率限制（Redis）

- 每用户每小时最多 100 次上传（Redis key：`upload:frequency:<userId>:<hour>`）
- 超限报 `429 TOO_MANY_REQUESTS`

文件：
- [service/src/modules/upload/upload.service.ts](../service/src/modules/upload/upload.service.ts)

---

## 3. 数据库是否记录“用户上传 PDF”

### 3.1 没有独立上传记录表

在当前代码扫描范围内：
- UploadService 只负责“存储并返回 URL”，**不写数据库**。
- 没有看到例如 `user_pdf` / `upload_log` 这类独立表。

### 3.2 业务表中会记录文件 URL（间接记录）

1) 对话组表 `chat_group`：
- `fileUrl`（text）：保存文件列表（JSON 字符串，元素形如 `{name,url,type}`）
- `pdfTextContent`（mediumtext）：字段存在，但目前没有写入逻辑

文件：
- [service/src/modules/chatGroup/chatGroup.entity.ts](../service/src/modules/chatGroup/chatGroup.entity.ts)

2) 聊天记录表 `chatlog`：
- `fileUrl`（text）：聊天记录上也保留了文件链接字段

文件：
- [service/src/modules/chatLog/chatLog.entity.ts](../service/src/modules/chatLog/chatLog.entity.ts)

---

## 4. 前端实现细节（Chat 用户端）

### 4.1 上传请求如何发出

- 上传 API 封装：`uploadFile(file, dir?)`，默认目录：`userFiles/YYYYMM/DD`
- 使用 axios 实例，自动带 Bearer token

文件：
- 上传 API： [chat/src/api/upload.ts](../chat/src/api/upload.ts)
- axios baseURL： [chat/src/utils/request/axios.ts](../chat/src/utils/request/axios.ts)

### 4.2 文件大小与数量限制（前端 vs 后端）

前端在 `Footer/index.vue` 中做了额外限制：
- 文档（含 PDF）大小限制：**20MB**（注意：后端硬限制 10MB，因此 10~20MB 的文件前端会放行，但后端会拒绝）
- 图片大小限制：10MB
- 数量限制：
  - 图片最多 4 张（“已保存 + 本次待发送”合并计数）
  - 文档最多 5 个（以“已保存文件数”为主）

文件：
- [chat/src/views/chat/components/Footer/index.vue](../chat/src/views/chat/components/Footer/index.vue)

### 4.3 文件与图片上传时机不同

- 图片：通常在“点击发送”时批量上传（用于拼接 `imageUrl`）
- 文档（PDF/Word/Excel...）：选择后立即上传，并立刻写入对话组 `fileUrl`

文件：
- [chat/src/views/chat/components/Footer/index.vue](../chat/src/views/chat/components/Footer/index.vue)

---

## 5. Admin 管理端与上传配置的关系

### 5.1 配置入口（UI）

管理端提供了对应的存储配置页面，用于写 `config` 表：
- 本地存储： [admin/src/views/storage/localStorage.vue](../admin/src/views/storage/localStorage.vue)
- 腾讯 COS： [admin/src/views/storage/tencent.vue](../admin/src/views/storage/tencent.vue)
- S3： [admin/src/views/storage/s3.vue](../admin/src/views/storage/s3.vue)
- 阿里 OSS： [admin/src/views/storage/ali.vue](../admin/src/views/storage/ali.vue)
- Chevereto： [admin/src/views/storage/chevereto.vue](../admin/src/views/storage/chevereto.vue)

这些页面的提示里也明确了优先级：本地 > S3 > COS > OSS。

### 5.2 配置保存调用的后端接口

- 查询配置：`POST /api/config/query`（AdminAuthGuard）
- 设置配置：`POST /api/config/set`（SuperAuthGuard，只有 super 权限可改）

文件：
- controller： [service/src/modules/globalConfig/globalConfig.controller.ts](../service/src/modules/globalConfig/globalConfig.controller.ts)
- admin 调用上传 API： [admin/src/api/modules/upload.ts](../admin/src/api/modules/upload.ts)

---

## 6. 我想先试试上传 PDF：最低配置怎么跑通？

### 方案 A：不配 COS，直接用本地存储（最省事）

1) 启动 service，并保证能连上 Redis + MySQL（上传频率检查依赖 Redis；配置存储依赖 MySQL）。
2) 登录 admin（需要 super 权限才能 set config）。
3) 在“本地存储配置”页面：
   - `localStorageStatus = 1`
   - `siteUrl = 你的 service 外网/本机访问地址`（例如 `http://localhost:3000`）
4) 回到 chat 端，上传 **小于 10MB 的 PDF**。
5) 成功后你会看到返回的 URL 类似：`http://localhost:3000/file/userFiles/YYYYMM/DD/<timestamp>_<rand>.pdf`

注意：前端文档限制写的是 20MB，但后端会拒绝 >10MB。

### 方案 B：需要 COS（生产更常见）

在 admin 的“腾讯云COS参数设置”里：
- 开启 `tencentCosStatus = 1`
- 填 `cosSecretId / cosSecretKey / cosBucket / cosRegion`
- 可选填 `tencentCosAcceleratedDomain`

然后上传会优先走本地（若本地也开了），否则才走 COS。

---

## 7. 你关心的问题逐条回答

1) 上传 PDF 的接口在哪？
- `POST /api/upload/file`（JWT 登录后）

2) 有没有数据库记录用户上传 PDF 的数据？
- 没有单独“上传记录表”。
- 但对话组 `chat_group.fileUrl` 和聊天记录 `chatlog.fileUrl` 会存文件 URL（属于“业务侧间接记录”）。

3) 不是限制了上传 PDF < 10MB 吗？
- 是的，后端强制 10MB。
- 前端对文档写的是 20MB，存在不一致。

4) 是不是需要配置 COS？
- 不必须；开本地存储就能跑通。
- 但至少要在后台开启一种上传后端，否则 upload 接口会报“未配置任何上传方式”。

---

## 8. 建议的后续检查点（如果你要进一步确认“PDF 能不能被模型用起来”）

- 追踪后端 `ChatService`/`OpenAIChatService` 是否真的把 `fileUrl` 里的 PDF URL 内容“读取/转文本/向量化”后再喂给模型。
- 目前只看到 `chat_group.pdfTextContent` 字段与 `pdf-parse` 的引入，但没看到写入点；说明“PDF 解析”可能是未完成/被裁剪的功能。
