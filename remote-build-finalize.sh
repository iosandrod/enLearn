set -eu
cd /mnt/c/project/enLearn
cp .env.production .env.production.before-storage-final
sed -i 's#^NEXT_PUBLIC_SUPABASE_URL=.*#NEXT_PUBLIC_SUPABASE_URL=http://117.72.155.0:54321#' .env.production
sed -i 's#^SUPABASE_PUBLIC_URL=.*#SUPABASE_PUBLIC_URL=http://117.72.155.0:54321#' .env.production
docker tag enlearn-api:latest enlearn-api:runtime-base
cp Dockerfile Dockerfile.before-runtime-reuse
awk '/^FROM base AS api-runtime/{print "FROM enlearn-api:runtime-base AS api-runtime"; skip=1; next} skip && /^WORKDIR \/app$/{skip=0} !skip{print}' Dockerfile > /tmp/enlearn-runtime-Dockerfile
cp /tmp/enlearn-runtime-Dockerfile Dockerfile
COMPOSE_BAKE=false docker compose --progress plain -p enlearn --env-file .env.production build api > /tmp/enlearn-api-final-build.log 2>&1
docker compose -p enlearn --env-file .env.production up -d --no-build --force-recreate --no-deps api web
docker compose -p enlearn --env-file .env.production ps
