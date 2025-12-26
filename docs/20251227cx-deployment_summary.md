# 项目部署与集成改动汇总 (2025-12-26)

## 1. pdf_to_anki 项目改动

### 1.1 代码修正 (`src/core/config.py`)
为了防止在未配置环境变量时程序崩溃，对配置加载逻辑进行了容错处理：
- **修改点**：将 `book_name` 的获取方式从强制读取改为带默认值。
- **文件路径**：[pdf_to_anki/src/core/config.py](pdf_to_anki/src/core/config.py)
- **效果**：避免了 `KeyError: 'PDF_TO_ANKI_BOOK_NAME'` 导致的容器启动失败。
-----
                # For API mode, we might not have a book_name at startup.
                # We use a placeholder to avoid crashing during module import.
                book_name = "default"
### 1.2 依赖补充 (`requirements.txt`)
添加了连接 MySQL 数据库所需的驱动：
- **文件路径**：[pdf_to_anki/requirements.txt](pdf_to_anki/requirements.txt)
- **新增内容**：
  ```text
  pymysql
  cryptography
  ```
------------
pymysql
cryptography
### 1.3 Docker 配置 (`docker-compose.yml`)
为了让 Worker 容器能够访问到 `99ai` 的数据库和后端网络：
- **文件路径**：[pdf_to_anki/docker-compose.yml](pdf_to_anki/docker-compose.yml)
- **主要改动**：
    - 添加了外部网络 `aiwebquickdeploy_default`。
    - 暴露了 `8000` 端口。
    - 配置了容器名称 `pdf-to-anki`。
-------------------
    networks:
      - aiwebquickdeploy_default
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  aiwebquickdeploy_default:
    external: true
### 1.4 环境变量 (`src/.env`)
更新了连接参数以匹配 Docker 内部网络：
- **文件路径**：[pdf_to_anki/src/.env](pdf_to_anki/src/.env)
- **关键配置**：
    - `DB_HOST=mysql` (指向 MySQL 容器)
    - `BACKEND_URL=http://99ai:49520` (指向 99ai 后端容器)
    - `WORKER_TOKEN=devtoken` (用于回调认证)
    - `PDF_TO_ANKI_WORKER_TOKEN=devtoken` (用于 API 访问认证)

---
DB_HOST=mysql
BACKEND_URL=http://99ai:49520
PDF_TO_ANKI_WORKER_TOKEN=devtoken

## 2. 99ai / 数据库改动

### 2.1 数据库配置表 (`chatanki.config`)
在 `chatanki` 数据库中插入或更新了关键配置，使前端能够找到并调用 Worker：

1.  **Worker URL 配置**：
    - `configKey`: `noteGenWorkerUrl`
    - `configVal`: `http://pdf-to-anki:8000/api/pdf-note/note-gen`
2.  **认证 Token 配置**：
    - `configKey`: `noteGenWorkerToken`
    - `configVal`: `devtoken`

**执行的 SQL 语句参考**：
```sql
-- 设置 Worker 地址
INSERT INTO config (configKey, configVal, public, status) 
VALUES ('noteGenWorkerUrl', 'http://pdf-to-anki:8000/api/pdf-note/note-gen', 0, 1)
ON DUPLICATE KEY UPDATE configVal='http://pdf-to-anki:8000/api/pdf-note/note-gen';

-- 设置认证 Token
INSERT INTO config (configKey, configVal, public, status) 
VALUES ('noteGenWorkerToken', 'devtoken', 0, 1)
ON DUPLICATE KEY UPDATE configVal='devtoken';
```

---

## 3. 运维操作步骤

如果您需要重新部署或在其他环境复现，请按以下顺序操作：

1.  **进入 `pdf_to_anki` 目录**。
2.  **构建并启动 Worker**：
    ```bash
    sudo docker compose up -d --build
    ```
3.  **检查数据库配置**：确保 `config` 表中的 `noteGenWorkerUrl` 和 `noteGenWorkerToken` 正确。
4.  **重启 99ai 后端**：
    ```bash
    sudo docker restart 99ai
    ```
5.  **验证连接**：
    - 访问 `http://<服务器IP>:8000/api/pdf-note/health` 应返回 `{"status":"ok"}`。
    - 在 `lumamemo.com` 提交 PDF 任务，观察 `pdf-to-anki` 容器日志。

---

## 4. 当前状态
- **Worker 状态**：已正常运行并监听 8000 端口。
- **集成状态**：`99ai` 已能成功触发 Worker 任务。
- **认证状态**：401 错误已通过统一 `noteGenWorkerToken` 解决。
