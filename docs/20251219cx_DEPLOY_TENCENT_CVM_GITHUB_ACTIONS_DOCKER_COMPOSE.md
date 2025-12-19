# 99AI-ANKI：腾讯云 CVM + GitHub Actions + Docker Compose 小白部署手册

适用目标：
- 你把本项目推到 GitHub
- 每次 `push` 到 `main` 分支后，GitHub Actions 自动把部署产物同步到你的腾讯云 CVM
- CVM 上用 Docker/Compose 运行服务（含 MySQL、Redis、99AI 后端）

本仓库现状（已对齐）：
- 已提供可直接部署的目录：`AIWebQuickDeploy/`
- 该目录包含：`docker-compose.yml`、`Dockerfile`、`dist/`、`public/`、`.env.example`、`.env.docker`
- 默认容器对外端口：`9520`（Compose 映射为 `9520:9520`）

重要说明（你提到的“自动链接相关文件”）：
- `AIWebQuickDeploy/` 不是自动跟随 `admin/chat/service` 源码变化的“软链接目录”。
- 它本质上是一个“部署打包目录”：
  - 后端来自 `service/dist/`
  - 管理端来自 `admin/dist/`
  - Chat 前端来自 `chat/dist/`
- 你修改了 `admin/chat/service` 后，需要重新打包生成 `AIWebQuickDeploy/`，否则服务器部署仍会用旧的构建产物。
- 本仓库已提供 `build.sh` 用来自动打包；并且本部署方案的 GitHub Actions 已配置为：每次部署前自动运行 `build.sh` 再同步 `AIWebQuickDeploy/` 到服务器。

> 推荐入口：用 Nginx 做 HTTPS 与反代（外网只开 80/443），后端实际跑在 `127.0.0.1:9520`。

---

## 0. 你需要准备什么

- 一台腾讯云 CVM（建议：Ubuntu 22.04 LTS；配置至少 2C4G，推荐 4C8G）
- 一个域名（建议：`lumamemo.com`，用于 HTTPS）
- 一个 GitHub 仓库（把 `99AI-ANKI/` 推上去）
- 你的电脑上能用 SSH（Windows 推荐：PowerShell + OpenSSH，或用 Xshell/MobaXterm）

---

## 1. CVM 创建与网络放行（安全组）

### 1.1 选择系统
- Ubuntu 22.04 LTS（本文以 Ubuntu 为例）

### 1.2 安全组放行端口
建议只放行必要端口：
- `22`：SSH 登录（仅限你自己的 IP 更安全）
- `80`：HTTP（申请证书/跳转 HTTPS）
- `443`：HTTPS

不建议直接对公网放行：
- `9520`（建议只让 Nginx 反代到本机 9520）
- `3306`、`6379`（MySQL/Redis 绝对不要对公网开放）

---

## 2. 第一次登录服务器（root）并做基础加固

> 下面命令在服务器上执行（通过 SSH 登录）。

### 2.1 更新系统
```bash
apt update
apt -y upgrade
reboot
```
重启后重新 SSH 登录。

### 2.2 配置 SSH 免密（ubuntu 版，推荐），名称id_99ai
在你本机（Windows PowerShell）生成一对密钥（如果你已有可跳过）：
```powershell
ssh-keygen -t ed25519 -C "ubuntu@99ai"
```

把公钥复制到服务器（第一次可能需要输入密码）：
```powershell
ssh-copy-id -p 22 ubuntu@81.69.47.57
```

测试免密登录：
```powershell
ssh -i ~/.ssh/id_99ai -p 22 ubuntu@81.69.47.57
```

### 2.3 禁止密码登录（强烈推荐）
确认你已经能用密钥登录后再做（否则可能把自己锁在门外）。

编辑 SSH 配置：
```bash
sudo nano /etc/ssh/sshd_config
```
把以下项设置为（没有就新增）：
```text
PasswordAuthentication no
PermitRootLogin no
```

重启 SSH：
```bash
sudo systemctl restart ssh
```

---

## 3. 安装 Docker + Docker Compose（服务器）

### 3.1 安装 Docker（Ubuntu 官方方式）
```bash
sudo apt update
sudo apt -y install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 3.2 验证安装
```bash
docker --version
docker compose version
docker run --rm hello-world
```

如果出现类似报错：
`permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`

说明当前用户（如 `ubuntu`）没有权限访问 Docker 守护进程。你有两种解决方式（二选一）：

方式 A（最省心）：所有 docker 命令前加 `sudo`
```bash
sudo docker run --rm hello-world
sudo docker compose version
```

方式 B（更顺手）：把当前用户加入 `docker` 组（推荐）
```bash
sudo usermod -aG docker $USER
newgrp docker
docker run --rm hello-world
```

> 如果 `newgrp docker` 后仍不生效，请退出 SSH 重新登录一次，再执行 `docker run --rm hello-world`。

### 3.3（国内机器常见）拉取镜像很慢/卡住：配置镜像加速

如果你发现 `docker pull` 很慢，或者 `curl -I https://registry-1.docker.io/v2/` 很慢，这是国内访问 Docker Hub 的常见情况。

先快速判断是否“走 IPv6 导致卡住”：
```bash
getent hosts registry-1.docker.io
curl -4 -I https://registry-1.docker.io/v2/
```

#### 方案 A（推荐）：配置 Docker 镜像加速
```bash
sudo mkdir -p /etc/docker
sudo nano /etc/docker/daemon.json
```

写入（如文件已存在，请把 `registry-mirrors` 合并进去）：
```json
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com"
  ]
}
```

重启 Docker 并重试拉取：
```bash
sudo systemctl daemon-reload
sudo systemctl restart docker

sudo docker pull hello-world
sudo docker run --rm hello-world
```

#### 方案 B（可选）：优先使用 IPv4（当 IPv6 解析但网络不可用时）
如果你 `getent hosts` 只返回 IPv6 地址，且 `curl -4` 明显更快，可以让系统优先走 IPv4：
```bash
sudo nano /etc/gai.conf
```

取消注释（去掉行首 `#`）：
```text
precedence ::ffff:0:0/96  100
```

保存后重新打开 SSH 会话，再重试 `docker pull`。

---

## 4. 服务器目录规划（非常重要：避免更新时把数据删了）

我们把“代码/部署文件”和“数据/上传文件”分开考虑。

推荐目录：
- `/home/ubuntu/99ai/AIWebQuickDeploy/`：部署目录（会被 GitHub Actions 同步更新；更适合 ubuntu 用户免权限问题）

在服务器上创建：
```bash
mkdir -p /home/ubuntu/99ai
```

---

## 5. 首次手动部署（先跑起来一次）

### 5.1 上传部署目录（第一次你可以手动上传）
你可以先用 Git 克隆（简单但会带上整个仓库）：
```bash
cd /home/ubuntu/99ai
sudo apt -y install git
git clone https://github.com/LumaMemo/99AI-ANKI.git
cd 99AI-ANKI/AIWebQuickDeploy
```

如果你发现克隆很慢（国内到 GitHub 常见），推荐用下面任意一种加速方式：

方式 A：浅克隆（已在上面使用 `--depth 1`）

方式 B：只拉部署需要的 `AIWebQuickDeploy/`（更快）
```bash
cd /home/ubuntu/99ai
rm -rf 99AI-ANKI

git clone --filter=blob:none --no-checkout https://github.com/LumaMemo/99AI-ANKI.git
cd 99AI-ANKI
git sparse-checkout init --cone
git sparse-checkout set AIWebQuickDeploy
git checkout

cd AIWebQuickDeploy
```

如果你不想在服务器安装 Git，也可以跳过，等 GitHub Actions 自动同步（第 7 节）。

### 5.2 准备 `.env.docker`
**强烈建议：把密码改掉**（MySQL root 密码等）。

在 `AIWebQuickDeploy/` 下：
```bash
cd /home/ubuntu/99ai/99AI-ANKI/AIWebQuickDeploy
cp -n .env.example .env.docker
nano .env.docker
```

至少检查/修改：
- `DB_PASS`（MySQL 密码）
- 其他第三方 API Key（如果项目用到）

你提到“服务器还没装 mysql/redis、数据库没创建”：
- **不需要在服务器上单独安装 MySQL/Redis**。
- 本项目的部署方式是 **Docker Compose 起 3 个容器**：`mysql`、`redis`、`99ai`。
- 第一次 `docker compose up -d` 时会自动拉取镜像并启动 MySQL/Redis。
- 数据库是否“创建好”，取决于 MySQL 容器的环境变量：
  - `MYSQL_DATABASE`：会自动创建数据库（例如 `chatgpt`）
  - `MYSQL_ROOT_PASSWORD` / `MYSQL_USER` / `MYSQL_PASSWORD`：会自动创建用户并设置密码

你需要改密码的位置有两处（务必保持一致）：
- `AIWebQuickDeploy/docker-compose.yml`：MySQL 容器的 `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD`
- `AIWebQuickDeploy/.env.docker`：应用连接数据库用的 `DB_PASS`（以及 `DB_USER`，通常是 `root`）

建议做法（最省心）：
- 让应用用 `root` 连接：`DB_USER=root`，`DB_PASS=与 MYSQL_ROOT_PASSWORD 一致`

### 5.3 启动（Compose）
```bash
sudo docker compose up -d --build
```

首次启动建议用下面命令确认 3 个容器都起来了：
```bash
sudo docker compose ps
sudo docker compose logs -f --tail=200 mysql
sudo docker compose logs -f --tail=200 99ai
```

查看运行状态：
```bash
sudo docker compose ps
```

查看日志：
```bash
sudo docker compose logs -f --tail=200
```

### 5.4 本机回环自测
在服务器上执行：
```bash
curl -I http://127.0.0.1:9520/
```
能返回 `HTTP/1.1 200` / `302` 之类就说明服务起来了。

---

## 6. 配置 Nginx + HTTPS（推荐：对外只暴露 80/443）

### 6.1 安装 Nginx
```bash
sudo apt -y install nginx
sudo systemctl enable --now nginx
```

### 6.2 配置反向代理到 9520
创建站点配置：
```bash
sudo nano /etc/nginx/sites-available/99ai.conf
```

填入（已按你的域名 `lumamemo.com` 写好）：
```nginx
server {
  listen 80;
  server_name lumamemo.com;

  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:9520;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

启用站点并测试：
```bash
sudo ln -sf /etc/nginx/sites-available/99ai.conf /etc/nginx/sites-enabled/99ai.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 6.3 申请 HTTPS 证书（Let’s Encrypt）
确保你的域名 A 记录已解析到这台 CVM 公网 IP。

#### 6.3.1 如果 certbot 报错：no valid A/AAAA records found
如果你执行 `sudo certbot --nginx -d lumamemo.com` 时出现类似错误：

```text
no valid A records found for lumamemo.com; no valid AAAA records found for lumamemo.com
```

这表示：**Let’s Encrypt 在公网 DNS 上查不到你的域名解析**（域名没有配置 A/AAAA 记录，或配置在错误的 DNS 平台/NS 不一致，或还没生效）。

按下面步骤处理：

1) 去你的域名解析平台添加记录（必须）
- 主机记录：`@`
- 记录类型：`A`
- 记录值：你的 CVM 公网 IP
- TTL：默认即可

（可选）再加一条：
- 主机记录：`www`
- 记录类型：`CNAME` 指向 `lumamemo.com`（或 `A` 也指向同一个公网 IP）

2) 检查域名 NS 是否指向你正在修改的解析平台（常见坑）
- 如果你的域名 NS 指向的是 DNSPod，但你在 Cloudflare/阿里云改解析，那么改了也不会生效。
- 请确保“域名的 NS”和“你修改解析的地方”是同一家。

3) 在服务器上验证解析是否生效（推荐用公共 DNS，避免缓存）
```bash
sudo apt update
sudo apt -y install dnsutils

dig @1.1.1.1 lumamemo.com A +short
dig @8.8.8.8 lumamemo.com A +short
```
能返回你的公网 IP 就说明解析 OK。

你也可以用系统解析命令快速验证：
```bash
getent hosts lumamemo.com
```

4) 验证 80 端口可访问（certbot http-01 验证依赖）
```bash
curl -I http://lumamemo.com
```
能返回 `200/301/302` 等响应即可。

5) 重新申请证书
```bash
sudo certbot --nginx -d lumamemo.com
```

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d lumamemo.com
```

证书自动续期：
```bash
sudo systemctl status certbot.timer
```

---

## 7. GitHub Actions：自动同步到 CVM 并重启 Compose

> 关于分支发布：本仓库的部署 workflow 触发条件是 **push 到 `main`**。
> 所以你完全可以按常见团队习惯开发：在功能分支/修复分支开发 → 提 PR → **合并到 `main`**。
> 只要 PR 合并发生（merge/squash/rebase 都可以），本质上都会产生一次对 `main` 的 push，因此会自动触发部署。
>
> 另外：workflow 也支持在 GitHub 的 `Actions` 页面里手动点击运行（`workflow_dispatch`），用于紧急重发/补发。

目标：你每次 `push main`，GitHub 自动做：
1) rsync `AIWebQuickDeploy/` 到服务器 `/home/ubuntu/99ai/AIWebQuickDeploy/`
2) 保留服务器上的 `data/`、`public/file/`（上传文件）、`.env.docker`、`logs/`
3) 在服务器上执行 `docker compose up -d --build`

### 7.1 在服务器准备部署目录
```bash
mkdir -p /home/ubuntu/99ai/AIWebQuickDeploy
```

首次准备 `.env.docker`（在服务器上编辑）：
```bash
cd /home/ubuntu/99ai/AIWebQuickDeploy
cp -n .env.example .env.docker || true
nano .env.docker
```

并先手动创建持久化目录（用于 MySQL/Redis/上传文件）：
```bash
mkdir -p /home/ubuntu/99ai/AIWebQuickDeploy/data/mysql
mkdir -p /home/ubuntu/99ai/AIWebQuickDeploy/data/redis
mkdir -p /home/ubuntu/99ai/AIWebQuickDeploy/public/file
mkdir -p /home/ubuntu/99ai/AIWebQuickDeploy/logs
```

### 7.2 在 GitHub 仓库设置 Secrets
进入你的 GitHub 仓库：`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

新增以下 secrets：
- `SSH_HOST`：服务器公网 IP 或域名
- `SSH_PORT`：SSH 端口（默认 `22`）
- `SSH_USER`：`ubuntu`
- `SSH_PRIVATE_KEY`：你本机 `~/.ssh/id_ed25519` 的私钥内容（整段复制）
- `DEPLOY_PATH`：`/home/ubuntu/99ai`

> 私钥内容获取（Windows PowerShell）：
> ```powershell
> Get-Content $env:USERPROFILE\.ssh\id_ed25519
> ```
> 复制全部内容到 `SSH_PRIVATE_KEY`。

### 7.3 添加 GitHub Actions workflow 文件
把仓库里新增文件：[.github/workflows/deploy-cvm-compose.yml](../.github/workflows/deploy-cvm-compose.yml)

提交并 push 到 `main` 后，Actions 会自动运行。

---

## 8. 发布/回滚/排错（常用命令）

### 8.1 发布
- 直接 `git push` 到 `main`，等待 GitHub Actions 运行完成。

### 8.2 服务器查看容器状态
```bash
cd /home/ubuntu/99ai/AIWebQuickDeploy
docker compose ps
```

### 8.3 查看日志
```bash
cd /home/ubuntu/99ai/AIWebQuickDeploy
docker compose logs -f --tail=200
```

### 8.4 手动重启服务
```bash
cd /home/ubuntu/99ai/AIWebQuickDeploy
docker compose restart 99ai
```

### 8.5 回滚（最简单方式）
因为我们是“同步文件 + compose 重启”，回滚可以用两种方式：
- 方式 A：GitHub 回滚一次提交（revert），再 push → 自动部署
- 方式 B：服务器上把目录备份为 `AIWebQuickDeploy.bak`（首次部署前你也可以手动留一个备份）

### 8.6 常见坑
- 外网打不开：优先检查安全组是否开 `80/443`、Nginx 是否运行、域名是否解析
- 容器起不来：看 `docker compose logs`，多半是 `.env.docker` 配置或数据库初始化失败
- 上传文件丢失：确认 Actions 同步时排除了 `public/file/`（本 workflow 已排除）

---

## 9. 下一步（如果你愿意我可以继续帮你做）

- 我可以根据你实际域名与端口，把 Nginx 配置和项目路径再精确到“复制即用”。
- 如果你希望更快更稳定的发布（不在服务器本地 build 镜像），我也可以给你改成：GitHub Actions 构建镜像 → 推 GHCR → 服务器 `docker compose pull`。
