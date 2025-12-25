# 用户自定义头像功能实施方案 (修正版：适配私有 COS)

目标：
- 1）在用户设置页面的“账号管理”中，实现用户自定义头像的上传与修改功能。
- 2）**修正**：鉴于腾讯云 COS 配置为“私有读写”，前端无法直接访问上传后的头像 URL。必须在后端新增“获取头像签名 URL”的接口。
- 3）上传成功后，更新用户资料，并在前端使用临时签名 URL 展示头像。

> 本文按“先定位根因 → 再最小改动修复 → 再做验收”的顺序写。文中涉及的文件路径均以 `99AI-ANKI` 为根。

---

## 0. 方案修正说明 (Why?)

### 原方案问题
原方案假设 `UploadService` 返回的 URL 是公网可访问的。但队友指出 COS 是“私有读写”的，这意味着：
1.  `UploadService` 返回的 `https://bucket.cos.region.myqcloud.com/path/to/file` 直接访问会报 `403 Forbidden`。
2.  前端 `<img src="...">` 无法加载该图片。

### 修正策略
参考 `kb.service.ts` 中的 `getFileSignedUrl` 实现，我们需要：
1.  **后端新增接口**：`GET /user/avatar/signed-url`。
    -   功能：为当前用户的头像（存储在 `avatar` 字段的 COS Path）生成一个带有效期的临时签名 URL。
2.  **前端逻辑变更**：
    -   **上传时**：依然调用 `/upload/file`，将返回的 COS 路径（非 http 开头的 path 或包含私有 bucket 域名的 path）存入 `user.avatar`。
    -   **展示时**：不直接使用 `user.avatar`，而是拿它去换取签名 URL，或者让后端在 `getUserInfo` 时直接返回签名后的 URL。

**为了最小化改动，建议方案如下：**
*   **后端 (`UserService`)**: 修改 `getUserInfo` 方法。在返回用户信息前，如果 `avatar` 字段是 COS 路径，则自动生成签名 URL 并覆盖返回的 `avatar` 字段（或者增加 `avatarUrl` 字段）。这样前端展示逻辑几乎不用变。
*   **前端**: 仅需处理上传逻辑。

---

## 1. 后端修改 (`service`)

### 1.1 修改 `UserService` (`src/modules/user/user.service.ts`)

我们需要在 `getUserInfo` 中增加对头像的签名处理。

**新增依赖**: `UploadService` (需要注入它来获取 COS 配置并生成签名)。

**修改点**:
在 `getUserInfo` 方法中：
1.  检查 `userInfo.avatar`。
2.  如果它看起来像是一个 COS 文件路径（或者我们约定上传头像时只存 Path），则调用 COS SDK 生成签名 URL。
3.  **更简单的做法**：`UploadService` 中的 `uploadFile` 目前返回的是绝对 URL。如果 Bucket 是私有的，这个 URL 访问不通。我们需要在 `UploadService` 中增加一个 `getSignedUrl(url)` 方法。

**待确认**: `UploadService` 目前的 `uploadFileByTencentCos` 返回的是 `https://...`。如果 Bucket 私有，这个返回本身没错，只是无法访问。

**决定方案**:
在 `UserService` 中注入 `UploadService`。
修改 `getUserInfo`：
```typescript
// 伪代码
async getUserInfo(userId: number) {
  // ... 原有逻辑 ...
  const userInfo = await this.userEntity.findOne(...)
  
  // 新增：处理头像签名
  if (userInfo.avatar && userInfo.avatar.includes('myqcloud.com')) {
     // 调用 UploadService 的新方法生成签名
     userInfo.avatar = await this.uploadService.getSignedUrl(userInfo.avatar);
  }
  
  return { userInfo, ... };
}
```

### 1.2 修改 `UploadService` (`src/modules/upload/upload.service.ts`)

新增方法 `getSignedUrl(fileUrl: string)`:
1.  解析 `fileUrl` 获取 Key (文件路径)。
2.  实例化 `TENCENTCOS`。
3.  调用 `cos.getObjectUrl` 获取带签名的 URL。

---

## 2. 前端修改 (`chat`)

### 2.1 确认上传 API (`src/api/upload.ts`)
保持不变，用于上传文件。

### 2.2 账号管理组件 (`src/components/Settings/AccountManagement.vue`)

逻辑微调：
1.  **上传**: 调用 `uploadFile`。
2.  **更新**: 调用 `updateUserInfo({ avatar: res.data })`。注意：这里存入数据库的是原始 COS URL（不带签名）。
3.  **刷新**: 调用 `authStore.getUserInfo()`。此时后端 `getUserInfo` 会返回带签名的 URL，前端即可正常显示。

---

## 3. 实施步骤

### 步骤 1: 后端 - `UploadService` 增强
在 `src/modules/upload/upload.service.ts` 中添加 `getSignedUrl` 方法。
-   需复用 `getUploadConfig` 获取密钥。
-   使用 `cos.getObjectUrl`。

### 步骤 2: 后端 - `UserService` 增强
1.  在 `UserModule` 中导入 `UploadModule` (或直接在 Service 注入 `UploadService`，需检查模块依赖关系，避免循环依赖)。如果 `UserModule` 和 `UploadModule` 循环依赖，可能需要重构，或者直接在 `UserService` 中使用 `GlobalConfigService` 重新实例化 COS 客户端（参考 `kb.service.ts` 的做法，这样更安全）。
2.  **推荐做法**：参考 `kb.service.ts`，在 `UserService` 中私有实现一个简单的 `signAvatarUrl` 方法，避免复杂的模块依赖。
3.  修改 `getUserInfo`，对 `avatar` 字段进行签名处理。

### 步骤 3: 前端 - `AccountManagement.vue`
同原计划，实现上传交互。

---

## 4. 验收测试

1.  **上传**: 上传一张图片。
2.  **数据库检查**: 查看 `users` 表 `avatar` 字段，应为 `https://...` (无签名参数)。
3.  **API 响应检查**: 查看 `GET /api/auth/getInfo` 响应，`data.userInfo.avatar` 应包含 `?sign=...` 等签名参数。
4.  **前端展示**: 图片能正常加载，不报 403。

实施成果总结
  1. 后端支持 (`UploadService`):
       * 新增 getSignedUrl 方法，能够将私有 COS 桶中的文件链接转换为带签名的 1 小时临时访问链接。
   2. 自动签名逻辑 (`UserService`):
       * 修改了 getUserInfo 方法。现在每当用户请求个人信息时，后端会自动为 avatar 字段进行签名。
       * 优点：前端无需做任何显示逻辑的改动，且利用了 1 小时的签名有效期，配合浏览器的 HTTP
         缓存，极大节省了腾讯云的下行流量。
   3. 前端交互 (`AccountManagement.vue`):
       * 头像区域现在支持点击上传。
       * 增加了文件校验（仅限图片，最大 2MB）。
       * 增加了上传状态提示（Loading 动画）。
       * 上传成功后会自动调用用户信息刷新，即时显示新头像。