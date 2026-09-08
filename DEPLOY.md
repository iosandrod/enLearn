# enLearn 单机部署

这套配置适合一台 Linux 云服务器：Caddy 提供 HTTPS 和静态前端，Nest standalone API 在同一台机器运行，数据库、鉴权和文件存储使用托管 Supabase。默认不启动 Redis、Trigger.dev 和 frePPLe，因此只有两个容器。

## 1. 准备服务器

建议 Ubuntu 22.04/24.04，至少 2 vCPU、2 GB RAM、30 GB SSD。安装 Docker Engine 和 Compose 插件，并把域名的 `A/AAAA` 记录指向服务器。安全组只开放 `22`、`80`、`443`。

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
ACME_EMAIL=admin@example.com
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgres://...
DIRECT_URL=postgres://...
VITE_API_BASE_URL=/api
VITE_SOCKET_BASE_URL=
TRIGGER_DEV_WORKER_AUTOSTART=0
PLANNING_RUN_MODE=inline
PLANNING_ENGINE_MODE=cpp-typescript
```

`.env.production` 只放服务器，不要提交 Git。`SUPABASE_SERVICE_ROLE_KEY` 只能放后端变量，不能以 `VITE_` 开头。

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

首次启动后访问 `https://app.example.com`。Caddy 会自动申请证书；证书和配置保存在 Docker volume 中。

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
curl -I https://app.example.com
curl -i https://app.example.com/api/service
```

如果证书申请失败，先确认 DNS 已生效且 80/443 没有被其他服务占用；如果前端能打开但接口失败，检查 `api` 日志和 `.env.production` 中的 Supabase 变量。
