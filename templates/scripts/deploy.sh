#!/bin/bash

# 部署脚本 - 由CI/CD自动调用
# 此脚本不需要手动执行

set -e

# 环境变量
APP_NAME="{{APP_NAME}}"
DEPLOY_PATH="{{DEPLOY_DIR}}"
ENV_TYPE=${1:-development}
ENABLE_MIGRATION="{{ENABLE_MIGRATION}}"  # 是否启用数据库迁移: true/false
MIGRATION_COMMAND="{{MIGRATION_COMMAND}}"  # 迁移命令，默认 npm run migration:run
ENABLE_SSL="{{ENABLE_SSL}}"  # 是否启用 SSL: true/false
SSL_EMAIL="{{SSL_EMAIL}}"  # SSL 证书邮箱
ENABLE_DOCKER_CLEANUP="{{ENABLE_DOCKER_CLEANUP}}"  # 是否启用 Docker 清理: true/false
DOCKER_CLEANUP_STRATEGY="{{DOCKER_CLEANUP_STRATEGY}}"  # 清理策略: aggressive(激进)/gentle(温和)

# 根据环境设置端口和域名
if [ "$ENV_TYPE" = "production" ]; then
  export APP_PORT={{PROD_PORT}}
  export DOMAIN="{{PROD_DOMAIN}}"
else
  export APP_PORT={{DEV_PORT}}
  export DOMAIN="{{DEV_DOMAIN}}"
fi

echo "开始部署 $APP_NAME 到 $ENV_TYPE 环境 (端口: $APP_PORT)..."

# 检查端口是否被占用（排除当前应用的容器）
check_port() {
    local PORT=$1
    # 获取占用端口的进程，排除当前应用的 docker-proxy
    local OCCUPIED=$(lsof -i :$PORT -t 2>/dev/null | while read PID; do
        PROC_NAME=$(ps -p $PID -o comm= 2>/dev/null)
        PROC_CMD=$(ps -p $PID -o args= 2>/dev/null)
        # 如果是 docker-proxy 且属于当前应用，跳过
        if [[ "$PROC_NAME" == "docker-proxy" ]] && docker ps --format '{{.Names}}' | grep -q "^${APP_NAME}"; then
            continue
        fi
        echo "$PID"
    done)

    if [ -n "$OCCUPIED" ]; then
        echo "❌ 端口 $PORT 已被占用:"
        lsof -i :$PORT 2>/dev/null | head -5
        echo ""
        echo "请检查端口配置或停止占用端口的进程"
        exit 1
    fi
    echo "✓ 端口 $PORT 可用"
}

# 检查端口（仅在非更新部署时检查）
if ! docker ps --format '{{.Names}}' | grep -q "^${APP_NAME}"; then
    check_port $APP_PORT
fi

# Nginx 反向代理配置函数
configure_nginx_proxy() {
    local DOMAIN=$1
    local PORT=$2

    if [ -z "$DOMAIN" ]; then
        echo "跳过 Nginx 配置（未提供域名）"
        return
    fi

    echo "配置 Nginx 反向代理: $DOMAIN -> localhost:$PORT"

    # 检查宝塔是否安装
    if [ ! -d "/www/server/panel/vhost/nginx" ]; then
        echo "警告：未检测到宝塔面板，跳过 Nginx 配置"
        return
    fi

    # 创建 Nginx 配置
    cat > /www/server/panel/vhost/nginx/${DOMAIN}.conf << EOF
# 由 CloudDreamAI CI/CD 自动生成 - $(date)
server {
    listen 80;
    server_name ${DOMAIN};

    access_log /www/wwwlogs/${DOMAIN}.log;
    error_log /www/wwwlogs/${DOMAIN}.error.log;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

    # 重载 Nginx
    if command -v nginx &> /dev/null; then
        nginx -t && nginx -s reload
        echo "✓ Nginx 配置已更新并重载"
    else
        echo "警告：未找到 nginx 命令，请手动重载 Nginx"
    fi
}

# 配置 HTTPS Nginx（使用已有证书）
configure_ssl_nginx() {
    local DOMAIN=$1
    local PORT=$2

    cat > /www/server/panel/vhost/nginx/${DOMAIN}.conf << EOF
# 由 CloudDreamAI CI/CD 自动生成 - $(date) - HTTPS
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /www/wwwroot/acme-challenge;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};

    ssl_certificate /www/server/panel/vhost/cert/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    access_log /www/wwwlogs/${DOMAIN}.log;
    error_log /www/wwwlogs/${DOMAIN}.error.log;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

    nginx -t && nginx -s reload
    echo "✓ HTTPS 配置完成: https://$DOMAIN"
}

# 检查 SSL 证书是否有效（存在且未过期）
check_ssl_valid() {
    local DOMAIN=$1
    local CERT_FILE="/www/server/panel/vhost/cert/${DOMAIN}/fullchain.pem"

    if [ ! -f "$CERT_FILE" ]; then
        return 1  # 证书不存在
    fi

    # 检查证书是否在 7 天内过期
    if openssl x509 -checkend 604800 -noout -in "$CERT_FILE" 2>/dev/null; then
        return 0  # 证书有效
    else
        return 1  # 证书即将过期或已过期
    fi
}

# SSL 证书配置函数（使用 acme.sh + Let's Encrypt）
configure_ssl() {
    local DOMAIN=$1
    local PORT=$2
    local EMAIL=$3

    if [ -z "$DOMAIN" ]; then
        echo "跳过 SSL 配置（未提供域名）"
        return
    fi

    if [ -z "$EMAIL" ]; then
        echo "跳过 SSL 配置（未提供邮箱）"
        return
    fi

    # 检查宝塔是否安装
    if [ ! -d "/www/server/panel/vhost/nginx" ]; then
        echo "警告：未检测到宝塔面板，跳过 SSL 配置"
        return
    fi

    echo "配置 SSL 证书: $DOMAIN"

    # 检查证书是否已存在且有效
    if check_ssl_valid "$DOMAIN"; then
        echo "✓ SSL 证书已存在且有效，跳过申请"
        # 直接配置 HTTPS（使用现有证书）
        configure_ssl_nginx "$DOMAIN" "$PORT"
        return
    fi

    # 安装 acme.sh（如果没有）
    if [ ! -f ~/.acme.sh/acme.sh ]; then
        echo "安装 acme.sh..."
        curl https://get.acme.sh | sh -s email=$EMAIL
        source ~/.bashrc 2>/dev/null || true
    fi

    # 创建验证目录
    mkdir -p /www/wwwroot/acme-challenge

    # 先配置 HTTP，添加 acme-challenge location
    cat > /www/server/panel/vhost/nginx/${DOMAIN}.conf << EOF
# 由 CloudDreamAI CI/CD 自动生成 - $(date)
server {
    listen 80;
    server_name ${DOMAIN};

    access_log /www/wwwlogs/${DOMAIN}.log;
    error_log /www/wwwlogs/${DOMAIN}.error.log;

    # Let's Encrypt 验证
    location /.well-known/acme-challenge/ {
        root /www/wwwroot/acme-challenge;
    }

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

    nginx -t && nginx -s reload

    # 申请证书
    echo "申请 SSL 证书..."
    if ~/.acme.sh/acme.sh --issue -d $DOMAIN -w /www/wwwroot/acme-challenge --force; then
        echo "✓ 证书申请成功"

        # 创建证书目录
        mkdir -p /www/server/panel/vhost/cert/$DOMAIN

        # 安装证书
        ~/.acme.sh/acme.sh --install-cert -d $DOMAIN \
            --key-file /www/server/panel/vhost/cert/$DOMAIN/privkey.pem \
            --fullchain-file /www/server/panel/vhost/cert/$DOMAIN/fullchain.pem \
            --reloadcmd "nginx -s reload"

        # 更新 Nginx 配置支持 HTTPS
        cat > /www/server/panel/vhost/nginx/${DOMAIN}.conf << EOF
# 由 CloudDreamAI CI/CD 自动生成 - $(date) - HTTPS
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /www/wwwroot/acme-challenge;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};

    ssl_certificate /www/server/panel/vhost/cert/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    access_log /www/wwwlogs/${DOMAIN}.log;
    error_log /www/wwwlogs/${DOMAIN}.error.log;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

        nginx -t && nginx -s reload
        echo "✓ HTTPS 配置完成: https://$DOMAIN"
    else
        echo "⚠️ SSL 证书申请失败，保持 HTTP 配置"
    fi
}

# 数据库自动创建配置
DB_ENABLED="{{DB_ENABLED}}"  # 是否启用数据库自动创建: true/false
DB_TYPE="{{DB_TYPE}}"  # 数据库类型: pgsql/mysql

# 自动检测数据库客户端路径
find_db_client() {
    local CLIENT=$1
    # 常见路径：宝塔、系统默认、Docker 等
    local PATHS=(
        "/www/server/pgsql/bin/$CLIENT"
        "/www/server/mysql/bin/$CLIENT"
        "/usr/bin/$CLIENT"
        "/usr/local/bin/$CLIENT"
    )
    for P in "${PATHS[@]}"; do
        if [ -x "$P" ]; then
            echo "$P"
            return
        fi
    done
    # 最后尝试 PATH 中查找
    command -v "$CLIENT" 2>/dev/null
}

# 创建数据库函数（使用 SSH root 权限通过 sudo 执行）
create_database() {
    local DB_HOST=$1
    local DB_PORT=$2
    local DB_USER=$3
    local DB_PASS=$4
    local DB_NAME=$5

    if [ "$DB_ENABLED" != "true" ]; then
        return
    fi

    echo "检查并创建数据库: $DB_NAME (用户: $DB_USER)"

    if [ "$DB_TYPE" = "pgsql" ]; then
        local PSQL_CMD=$(find_db_client "psql")
        if [ -z "$PSQL_CMD" ]; then
            echo "❌ 未找到 psql 客户端，跳过数据库创建"
            return
        fi

        # 配置 PostgreSQL 允许 Docker 容器连接
        local PG_CONF="/www/server/pgsql/data/postgresql.conf"
        local PG_HBA="/www/server/pgsql/data/pg_hba.conf"
        local PG_RESTART_NEEDED=false

        if [ -f "$PG_CONF" ]; then
            # 检查是否已配置监听所有地址
            if ! grep -q "^listen_addresses = '\*'" "$PG_CONF"; then
                echo "配置 PostgreSQL 监听所有地址..."
                sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
                sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
                PG_RESTART_NEEDED=true
            fi
        fi

        if [ -f "$PG_HBA" ]; then
            # 允许所有 IP 连接（Docker 网段可能是 172.17.x.x、172.26.x.x 等，直接放开最简单）
            if ! grep -q "0.0.0.0/0" "$PG_HBA"; then
                echo "配置 PostgreSQL 允许外部连接..."
                echo "host    all             all             0.0.0.0/0               md5" >> "$PG_HBA"
                PG_RESTART_NEEDED=true
            fi
        fi

        # 检查 PostgreSQL 是否实际监听所有地址（配置可能已改但未重启）
        if ! netstat -tlnp 2>/dev/null | grep -q "0.0.0.0:5432"; then
            echo "检测到 PostgreSQL 未监听所有地址，需要重启..."
            PG_RESTART_NEEDED=true
        fi

        # 检查 PostgreSQL 是否有共享内存错误（测试连接）
        if ! sudo -u postgres $PSQL_CMD -c "SELECT 1" >/dev/null 2>&1; then
            echo "检测到 PostgreSQL 连接异常，需要重启..."
            PG_RESTART_NEEDED=true
        fi

        if [ "$PG_RESTART_NEEDED" = true ]; then
            # 先停掉旧容器，避免 PostgreSQL 重启后出现共享内存错误
            echo "停止旧容器（如果存在）..."
            docker container ls -q --filter "name=$APP_NAME" | xargs -r docker container stop 2>/dev/null || true

            echo "重启 PostgreSQL 服务..."
            # 宝塔 PostgreSQL 需要用 postgres 用户重启，用 immediate 模式强制立即关闭
            if [ -x "/www/server/pgsql/bin/pg_ctl" ]; then
                sudo -u postgres /www/server/pgsql/bin/pg_ctl restart -D /www/server/pgsql/data -m immediate -t 10 2>&1 || true
            else
                systemctl restart postgresql 2>/dev/null || /etc/init.d/postgresql restart 2>/dev/null || true
            fi
            sleep 3
            echo "✓ PostgreSQL 配置已更新"
        fi

        # 使用 sudo -u postgres 执行，利用 peer 认证无需密码
        # 检查并创建用户
        if ! sudo -u postgres $PSQL_CMD -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
            echo "创建用户 $DB_USER..."
            sudo -u postgres $PSQL_CMD -c "CREATE USER \"$DB_USER\" WITH PASSWORD '$DB_PASS';"
            echo "✓ 用户 $DB_USER 创建成功"
        else
            echo "✓ 用户 $DB_USER 已存在"
        fi

        # 检查并创建数据库
        if sudo -u postgres $PSQL_CMD -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
            echo "✓ 数据库 $DB_NAME 已存在"
        else
            echo "创建数据库 $DB_NAME..."
            sudo -u postgres $PSQL_CMD -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
            echo "✓ 数据库 $DB_NAME 创建成功"
        fi

        # 授予权限
        sudo -u postgres $PSQL_CMD -c "GRANT ALL PRIVILEGES ON DATABASE \"$DB_NAME\" TO \"$DB_USER\";"

    elif [ "$DB_TYPE" = "mysql" ]; then
        local MYSQL_CMD=$(find_db_client "mysql")
        if [ -z "$MYSQL_CMD" ]; then
            echo "❌ 未找到 mysql 客户端，跳过数据库创建"
            return
        fi

        # MySQL 使用 root 无密码本地连接（宝塔默认配置）
        # 检查并创建用户和数据库
        if ! $MYSQL_CMD -u root -e "SELECT 1 FROM mysql.user WHERE user='$DB_USER'" 2>/dev/null | grep -q 1; then
            echo "创建用户 $DB_USER..."
            $MYSQL_CMD -u root -e "CREATE USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
            $MYSQL_CMD -u root -e "CREATE USER '$DB_USER'@'%' IDENTIFIED BY '$DB_PASS';"
            echo "✓ 用户 $DB_USER 创建成功"
        else
            echo "✓ 用户 $DB_USER 已存在"
        fi

        if $MYSQL_CMD -u root -e "SHOW DATABASES" | grep -qw "$DB_NAME"; then
            echo "✓ 数据库 $DB_NAME 已存在"
        else
            echo "创建数据库 $DB_NAME..."
            $MYSQL_CMD -u root -e "CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            echo "✓ 数据库 $DB_NAME 创建成功"
        fi

        # 授予权限
        $MYSQL_CMD -u root -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';"
        $MYSQL_CMD -u root -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';"
        $MYSQL_CMD -u root -e "FLUSH PRIVILEGES;"
    fi
}

# 确保目录存在
mkdir -p $DEPLOY_PATH

# 当在CI/CD中执行时，文件已经通过rsync复制到部署目录，无需再次复制
if [ "$PWD" != "$DEPLOY_PATH" ]; then
  echo "复制项目文件到部署目录..."
  cp -r . $DEPLOY_PATH/
  cd $DEPLOY_PATH
fi

# 生成环境变量文件
echo "生成环境变量文件..."
bash ci/generate-env.sh $ENV_TYPE

# 将 .env 中的本地地址替换为 host.docker.internal（容器内访问宿主机）
if [ -f ".env" ]; then
    # 先转换 Windows 换行符为 Unix 格式
    sed -i 's/\r$//' .env
    sed -i 's/=localhost$/=host.docker.internal/g' .env
    sed -i 's/=127\.0\.0\.1$/=host.docker.internal/g' .env
    echo "✓ 已将本地地址转换为容器可访问的地址"
fi

# 创建数据库（如果启用）
if [ "$DB_ENABLED" = "true" ]; then
    echo "检查数据库配置..."
    if [ "$ENV_TYPE" = "production" ]; then
        create_database "{{DB_PROD_HOST}}" "{{DB_PROD_PORT}}" "{{DB_PROD_USERNAME}}" "{{DB_PROD_PASSWORD}}" "{{DB_PROD_DBNAME}}"
    else
        create_database "{{DB_DEV_HOST}}" "{{DB_DEV_PORT}}" "{{DB_DEV_USERNAME}}" "{{DB_DEV_PASSWORD}}" "{{DB_DEV_DBNAME}}"
    fi
fi

# 检查Docker是否已安装
if ! command -v docker &> /dev/null; then
  echo "Docker未安装，尝试安装Docker..."
  if command -v apt-get &> /dev/null; then
    apt-get update
    apt-get install -y apt-transport-https ca-certificates curl software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    apt-get update
    apt-get install -y docker-ce
  elif command -v yum &> /dev/null; then
    yum install -y yum-utils
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    yum install -y docker-ce docker-ce-cli containerd.io
    systemctl start docker
    systemctl enable docker
  elif command -v apk &> /dev/null; then
    apk add --update docker
    service docker start
  else
    echo "无法确定包管理器，请手动安装Docker"
    exit 1
  fi
fi

# 检查并安装 docker-compose
if ! command -v docker-compose &> /dev/null; then
  echo "安装 docker-compose..."

  if ! command -v curl &> /dev/null; then
    echo "安装curl..."
    if command -v apt-get &> /dev/null; then
      apt-get update && apt-get install -y curl
    elif command -v yum &> /dev/null; then
      yum install -y curl
    elif command -v apk &> /dev/null; then
      apk add --no-cache curl
    fi
  fi

  if command -v apt-get &> /dev/null; then
    apt-get update && apt-get install -y docker-compose
  elif command -v yum &> /dev/null; then
    yum install -y docker-compose
  elif command -v apk &> /dev/null; then
    apk add --no-cache docker-compose
  else
    echo "无法确定包管理器，尝试使用pip安装..."
    pip install docker-compose || pip3 install docker-compose
  fi
fi

# 再次检查 docker-compose 是否已安装
if ! command -v docker-compose &> /dev/null; then
  echo "无法安装 docker-compose，尝试手动安装最新版本..."
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
  curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# 拉取最新镜像并启动Docker容器
echo "拉取最新镜像并启动Docker容器..."

# 登录 GitLab Container Registry
if [ -n "$REGISTRY_URL" ] && [ -n "$REGISTRY_USERNAME" ] && [ -n "$REGISTRY_PASSWORD" ]; then
  echo "登录 GitLab Container Registry: $REGISTRY_URL"
  echo "$REGISTRY_PASSWORD" | docker login -u "$REGISTRY_USERNAME" --password-stdin "$REGISTRY_URL"
else
  echo "警告：未设置 GitLab Registry 凭据，尝试拉取公开镜像..."
fi

# 停止并移除旧容器
echo "清理现有容器..."
# 先强制停止同名容器（无论是否由 docker-compose 管理）
docker container ls -q --filter "name=$APP_NAME" | xargs -r docker container stop || true
docker container ls -aq --filter "name=$APP_NAME" | xargs -r docker container rm -f || true
# 再执行 docker-compose down 清理网络等资源
docker-compose down --remove-orphans || true

# 拉取镜像并启动容器
echo "尝试从 GitLab Container Registry 拉取镜像..."
if docker-compose pull; then
  echo "镜像拉取成功，启动容器..."
  APP_PORT=$APP_PORT docker-compose up -d
else
  echo "无法拉取镜像，检查是否存在 Dockerfile 进行本地构建..."
  if [ -f "Dockerfile" ]; then
    echo "找到 Dockerfile，进行本地构建..."
    export DOCKER_IMAGE="$APP_NAME:local"
    docker build -t $DOCKER_IMAGE .
    DOCKER_IMAGE=$DOCKER_IMAGE APP_PORT=$APP_PORT docker-compose up -d
  else
    echo "错误：无法拉取镜像且未找到 Dockerfile，部署失败"
    exit 1
  fi
fi

# 健康检测函数
health_check() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    🔍 部署健康检测                              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    local HEALTH_OK=true
    local WARNINGS=""

    # 1. 检查容器是否运行
    echo "1️⃣  检查容器状态..."
    if docker ps --format '{{.Names}} {{.Status}}' | grep -q "$APP_NAME.*Up"; then
        echo "   ✓ 容器正在运行"
    else
        echo "   ❌ 容器未运行"
        docker logs $APP_NAME --tail 30 2>&1 || true
        return 1
    fi

    # 2. 检查容器日志中的错误
    echo "2️⃣  检查启动日志..."
    local LOGS=$(docker logs $APP_NAME --tail 50 2>&1)

    # 检查数据库连接错误
    if echo "$LOGS" | grep -qi "password authentication failed\|ECONNREFUSED\|Unable to connect to the database\|connection refused"; then
        echo "   ❌ 检测到数据库连接错误"
        WARNINGS="$WARNINGS\n   - 数据库连接失败，请检查 DB_HOST/DB_PASSWORD 配置"
        HEALTH_OK=false
    fi

    # 检查端口绑定错误
    if echo "$LOGS" | grep -qi "EADDRINUSE\|address already in use"; then
        echo "   ❌ 检测到端口冲突"
        WARNINGS="$WARNINGS\n   - 端口 $APP_PORT 被占用"
        HEALTH_OK=false
    fi

    # 检查模块加载错误
    if echo "$LOGS" | grep -qi "Cannot find module\|MODULE_NOT_FOUND"; then
        echo "   ❌ 检测到模块加载错误"
        WARNINGS="$WARNINGS\n   - 依赖模块缺失，请检查 Dockerfile 构建"
        HEALTH_OK=false
    fi

    if [ "$HEALTH_OK" = true ]; then
        echo "   ✓ 日志无明显错误"
    fi

    # 3. 检查 HTTP 端口响应
    echo "3️⃣  检查 HTTP 服务..."
    sleep 3  # 等待服务完全启动

    local HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$APP_PORT" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "000" ]; then
        echo "   ❌ HTTP 服务无响应 (端口 $APP_PORT)"
        WARNINGS="$WARNINGS\n   - 应用未监听端口 $APP_PORT，可能启动失败"
        HEALTH_OK=false
    elif [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ]; then
        echo "   ❌ HTTP 返回 $HTTP_CODE"
        WARNINGS="$WARNINGS\n   - 服务返回 $HTTP_CODE，应用可能未正常启动"
        HEALTH_OK=false
    elif [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 400 ]; then
        echo "   ✓ HTTP 服务正常 (状态码: $HTTP_CODE)"
    elif [ "$HTTP_CODE" -ge 400 ] && [ "$HTTP_CODE" -lt 500 ]; then
        echo "   ✓ HTTP 服务已启动 (状态码: $HTTP_CODE，可能是根路径无路由或需要认证)"
    else
        echo "   ⚠️  HTTP 返回 $HTTP_CODE"
    fi

    # 输出诊断结果
    echo ""
    if [ "$HEALTH_OK" = true ]; then
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║  ✅ 部署成功！服务已正常启动                                   ║"
        echo "╚════════════════════════════════════════════════════════════════╝"
        return 0
    else
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║  ⚠️  部署完成但检测到问题                                       ║"
        echo "╠════════════════════════════════════════════════════════════════╣"
        echo -e "║  问题列表:$WARNINGS"
        echo "╠════════════════════════════════════════════════════════════════╣"
        echo "║  排查建议:                                                     ║"
        echo "║  1. 查看完整日志: docker logs $APP_NAME"
        echo "║  2. 检查 .env 文件中的数据库配置                               ║"
        echo "║  3. 确认数据库服务正常运行                                     ║"
        echo "╚════════════════════════════════════════════════════════════════╝"
        echo ""
        echo "最近日志:"
        docker logs $APP_NAME --tail 20 2>&1 || true
        return 1
    fi
}

# 检查部署状态
echo "检查部署状态..."
sleep 10
if ! health_check; then
    echo ""
    echo "❌ 健康检测未通过，但容器已部署。请根据上述提示排查问题。"
    exit 1
fi

# 执行数据库迁移（如果启用）
if [ "$ENABLE_MIGRATION" = "true" ]; then
  echo "执行数据库迁移..."

  # 等待应用完全启动（数据库连接就绪）
  echo "等待应用启动完成..."
  sleep 5

  # 在容器内执行迁移命令
  MIGRATION_CMD="${MIGRATION_COMMAND:-npm run migration:run}"
  echo "执行迁移命令: $MIGRATION_CMD"

  if docker-compose exec -T $APP_NAME sh -c "$MIGRATION_CMD"; then
    echo "✓ 数据库迁移执行成功"
  else
    echo "⚠️ 数据库迁移执行失败，请检查日志"
    echo "提示: 如果是首次部署且没有待执行的迁移，此警告可以忽略"
    # 不退出，迁移失败不应该导致整个部署失败
  fi
else
  echo "跳过数据库迁移（未启用）"
fi

# Docker 清理函数
cleanup_docker() {
    if [ "$ENABLE_DOCKER_CLEANUP" != "true" ]; then
        echo "跳过 Docker 清理（未启用）"
        return
    fi

    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    🧹 Docker 清理                              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    # 显示清理前的磁盘使用情况
    echo "清理前 Docker 磁盘使用情况:"
    docker system df 2>/dev/null || true
    echo ""

    if [ "$DOCKER_CLEANUP_STRATEGY" = "gentle" ]; then
        echo "执行温和清理（保留 7 天内的镜像）..."
        # 清理悬空镜像（<none> 标签）
        docker image prune -f 2>/dev/null || true
        # 清理超过 7 天未使用的镜像
        docker image prune -a --filter "until=168h" -f 2>/dev/null || true
    else
        echo "执行激进清理（清理所有未使用的镜像）..."
        # 清理所有未使用的镜像
        docker image prune -af 2>/dev/null || true
    fi

    # 清理未使用的构建缓存
    echo "清理构建缓存..."
    docker builder prune -f 2>/dev/null || true

    # 清理未使用的网络
    echo "清理未使用的网络..."
    docker network prune -f 2>/dev/null || true

    echo ""
    echo "清理后 Docker 磁盘使用情况:"
    docker system df 2>/dev/null || true
    echo ""
    echo "✓ Docker 清理完成"
}

# 配置 Nginx 反向代理和 SSL
if [ "$ENABLE_SSL" = "true" ]; then
    configure_ssl "$DOMAIN" "$APP_PORT" "$SSL_EMAIL"
else
    configure_nginx_proxy "$DOMAIN" "$APP_PORT"
fi

# 执行 Docker 清理
cleanup_docker

echo "部署完成!"
