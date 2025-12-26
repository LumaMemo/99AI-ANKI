# 腾讯云日志服务 (CLS) 采集配置总结

本文档总结了在腾讯云 CVM 服务器上，通过 LogListener 采集 Docker 容器（`pdf-to-anki` 和 `99ai`）日志的完整构建方法。

## 1. 服务器端配置 (已完成)

### 1.1 安装 LogListener
使用腾讯云内网镜像安装采集插件：
```bash
wget http://mirrors.tencentyun.com/install/cls/loglistener-linux-x64.tar.gz
sudo tar zxvf loglistener-linux-x64.tar.gz -C /usr/local/
cd /usr/local/loglistener/tools
sudo ./loglistener.sh install
```

### 1.2 初始化插件
使用云 API 密钥关联地域和权限：
- **Region**: `ap-shanghai`
- **SecretId**: `AKIDxm...` (已配置)
- **SecretKey**: `CAvVH...` (已配置)
```bash
sudo ./loglistener.sh init -secretid [SecretId] -secretkey [SecretKey] -region ap-shanghai
```

### 1.3 服务管理
- **启动**: `sudo systemctl start loglistenerd`
- **状态查询**: `sudo /etc/init.d/loglistenerd status`
- **心跳检查**: `sudo /etc/init.d/loglistenerd check` (当前服务器内网 IP: `10.0.0.5`)

---

## 2. 腾讯云控制台配置步骤

### 2.1 创建机器组
1. 进入 [CLS 控制台 - 机器组](https://console.cloud.tencent.com/cls/machine)。
2. 创建机器组，选择 **IP 地址** 模式。
3. 输入服务器内网 IP：`10.0.0.5`。

### 2.2 配置日志采集 (Docker 模式)
针对每个服务（`pdf-to-anki` 和 `99ai`），在对应的日志主题下新增采集配置：

#### A. 基础设置
- **采集类型**: 选择 **云服务器 CVM** -> **JSON-文件日志** (或直接搜索 **Docker 标准输出**)。
- **采集路径**:
    - **目录**: `/var/lib/docker/containers/*`
    - **文件名**: `*-json.log`

#### B. 提取模式
- **提取模式**: 选择 **JSON**。
- **原因**: Docker 默认日志格式为 JSON，包含 `log` (原始日志), `stream`, `time` 字段。

#### C. 容器区分与过滤 (关键)
为了在同一个服务器上区分不同容器的日志：
1. **开启 Docker 元数据**: 在“高级配置”中勾选。
2. **设置过滤器**:
    - **Key**: `container_name`
    - **Value**: `pdf-to-anki` (或 `99ai`)
3. **效果**: 只有匹配该名称的容器日志会被上传到当前主题。

---

## 3. 日志查看与分析

### 3.1 检索分析
1. 进入 [日志主题 - 检索分析](https://console.cloud.tencent.com/cls/search)。
2. 开启 **全文索引**。
3. 使用 SQL 或关键词查询，例如：
   - 搜索错误：`log : "ERROR"`
   - 按容器筛选：`container_name : "pdf-to-anki"`

### 3.2 优势
- **无侵入**: 无需修改业务代码或 Docker 镜像。
- **实时性**: 采集延迟通常在秒级。
- **持久化**: 日志存储在云端，不占用服务器磁盘空间，支持设置保留时长。
