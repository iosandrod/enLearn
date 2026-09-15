# enLearn 单机部署

这套配置适合一台 Linux 云服务器：Caddy 提供 HTTPS 和静态前端，Nest standalone API 在同一台机器运行，数据库、鉴权和文件存储使用托管 Supabase。默认不启动 Redis、Trigger.dev 和 frePPLe，因此只有两个容器。

## 1. 准备服务器

建议 Ubuntu 22.04/24.04，至少 2 vCPU、2 GB RAM、30 GB SSD。安装 Docker Engine 和 Compose 插件，并把域名的 `A/AAAA` 记录指向服务器。安全组开放 `22` 和前端端口 `8081`。

## 2. 配置环境变量

```bash
git clone <你的仓库地址> enlearn
cd enlearn
cp .env.production.example .env.production
nano .env.production
```

必须填写 Supabase 和域名变量：

```env
APP_DOMAIN=app.example.com
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgres://...
DIRECT_URL=postgres://...
VITE_API_BASE_URL=/api
VITE_SOCKET_BASE_URL=
TRIGGER_DEV_WORKER_AUTOSTART=0
FRONTEND_COMMAND_REDIS_ENABLED=0
PLANNING_RUN_MODE=inline
PLANNING_ENGINE_MODE=cpp-typescript
```

`.env.production` 只放服务器，不要提交 Git。`SUPABASE_SERVICE_ROLE_KEY` 只能放后端变量，不能以 `VITE_` 开头。

Windows 本机可以直接运行一键脚本：

```powershell
.\docker-start.ps1
```

修改前后端代码后，一键重新构建并同步到 Docker：

```powershell
.\docker-sync.ps1
```

也可以直接双击项目根目录的 `docker-sync.cmd`。只更新单个服务且其他容器已在运行时，可使用
`.\docker-sync.ps1 -Service web` 或 `.\docker-sync.ps1 -Service api`。

停止服务：

```powershell
.\docker-stop.ps1
```

## 远程 Windows Server 文件同步（FTP/FTPS）

仓库提供了 `ftp-sync.cmd` 和 `scripts/ftp-sync.ps1`。默认只上传 Git 工作区相对 `HEAD` 的变更文件以及未跟踪文件，并自动跳过 `.env`、依赖目录、构建目录和日志。

先复制配置模板（该文件已被 Git 忽略）：

```powershell
Copy-Item .ftp-sync.local.example.ps1 .ftp-sync.local.ps1
notepad .ftp-sync.local.ps1
```

将 `RemoteRoot` 改成 IIS FTP 用户对应的虚拟目录。密码不要写入配置文件，运行时输入即可；也可以在当前 PowerShell 会话设置环境变量：

```powershell
$secure = Read-Host 'FTP password' -AsSecureString
$env:ENLEARN_FTP_PASSWORD = [Net.NetworkCredential]::new('', $secure).Password
```

同步命令：

```powershell
.\ftp-sync.cmd                  # 只同步变更文件（默认）
.\ftp-sync.cmd -Mode All        # 同步所有非排除文件
.\ftp-sync.cmd -Mode Path -Path frontend\src,api\src
```

脚本默认使用 FTPS（端口 21）。服务器必须已安装 IIS FTP、创建 FTP 用户/授权规则，并绑定证书启用 SSL；如果服务器只有普通 FTP，可将 `Protocol` 改为 `Ftp`，但账号、密码和代码会明文传输，不建议在公网使用。若服务器启用了 OpenSSH，建议改用 SFTP（需 WinSCP/类似客户端），不要把普通 FTP 暴露到公网。

在 Windows Server 上可由管理员先确认 IIS FTP 组件和控制端口（被动模式端口范围、FTP 用户授权和站点物理目录仍需按你的站点规划配置）：

```powershell
Install-WindowsFeature Web-Server,Web-Ftp-Server,Web-Ftp-Service,Web-Mgmt-Console
New-NetFirewallRule -DisplayName 'IIS FTP control' -Direction Inbound -Protocol TCP -LocalPort 21 -Action Allow
```

不要把 FTP 目录直接指向包含 `.env`、数据库密钥或私钥的项目根目录；建议只授予一个专用部署目录的写权限，并让 IIS/Caddy/Docker 从该目录读取部署产物。

## 3. 启动和更新

```bash
docker compose --env-file .env.production build --pull
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f --tail=100 api web
```

更新代码时：

```bash
git pull
docker compose --env-file .env.production up -d --build
docker image prune -f
```

首次启动后访问 `http://app.example.com:8081`。

## 4. 数据库迁移和备份

先在发布环境执行需要的 Supabase migration，再重启 API：

```bash
docker compose exec api node -e "console.log('API container is ready')"
```

数据库备份、Auth 和 Storage 备份使用 Supabase 控制台或其项目备份策略，不要把数据库端口暴露到公网。

## 5. 可选能力

- 需要异步工作流时，将 `TRIGGER_DEV_WORKER_AUTOSTART=1` 并单独部署 `infra/triggerdev/docker-compose.yml`；这会额外需要 PostgreSQL、Redis、ClickHouse、MinIO 等服务，不建议与轻量主站混在 2 GB 机器上。
- 需要真实 frePPLe 排产时，单独启动 `infra/planning/docker-compose.yml`，并将 `PLANNING_ENGINE_MODE=http`、`PLANNING_ENGINE_ENDPOINT` 指向 sidecar。
- API 的 standalone 入口已经把领域服务放在同一进程内，所以默认不需要 Redis。

## 6. 常用排查

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 web
curl -I http://app.example.com:8081
curl -i http://app.example.com:8081/api/service
```

如果无法访问，先确认服务器安全组和防火墙已开放 `8081`；如果前端能打开但接口失败，检查 `api` 日志和 `.env.production` 中的 Supabase 变量。
