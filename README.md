# CloudDreamAI CI/CD Setup

🚀 云梦智联 GitLab CI/CD 自动配置工具 - 支持 NestJS/Vue/React 项目的一键 CI/CD 配置

## 功能特性

- ✨ **交互式配置** - 友好的命令行交互，无需手动编辑配置文件
- 🔄 **自动化部署** - 自动生成 `.gitlab-ci.yml` 和部署脚本
- 🔐 **安全管理** - 自动上传 CI/CD 变量到 GitLab，支持加密和保护
- 📦 **多项目支持** - 支持 NestJS、Vue、React 等多种项目类型
- 🐳 **Docker 化** - 基于 Docker 的完整部署流程
- 🌍 **多环境** - 支持开发/生产环境分离或单服务器多环境
- 📝 **GitLab Registry** - 使用 GitLab Container Registry，无需额外配置

## 安装使用

### 安装

```bash
npm install -g clouddreamai-cicd-setup
```

### 使用

在你的项目根目录运行：

```bash
cicd-setup init
```

## 使用前准备

### 1. GitLab Personal Access Token

1. 登录 GitLab
2. 进入 **User Settings** → **Access Tokens**
3. 创建新 Token，需要以下权限：
   - ✅ `api` - 访问 API
   - ✅ `write_repository` - 写入仓库
4. 复制生成的 Token（只显示一次，请妥善保存）

### 2. SSH 密钥

```bash
# 生成 SSH 密钥（如果还没有）
ssh-keygen -t rsa -b 4096 -C "gitlab-ci@your-domain.com" -f ~/.ssh/gitlab-ci-deploy

# 将公钥添加到服务器
ssh-copy-id -i ~/.ssh/gitlab-ci-deploy.pub root@服务器IP
```

### 3. 环境变量文件（必需）

**NestJS 项目必须提供环境变量文件：**

```bash
# 创建开发环境配置
cp .env.example .env.dev

# 创建生产环境配置
cp .env.example .env.prod
```

编辑这两个文件，填写对应环境的配置（数据库、Redis、密钥等）。

## 配置流程

运行 `cicd-setup init` 后，工具会交互式引导你完成以下配置：

### 1. GitLab 配置

```
📦 GitLab 配置

? GitLab 实例 URL: https://gitlab.clouddreamai.com
? GitLab Personal Access Token: glpat-xxxxxxxxxxxx
```

工具会立即测试连接，验证 Token 是否有效。

### 2. 镜像仓库配置

```
📦 镜像仓库配置

? 选择镜像仓库类型:
  ❯ GitLab Container Registry（推荐，无需额外配置）
    自建 Docker Registry
    不使用 Registry（服务器本地构建）
```

**推荐选择 GitLab Container Registry**：
- ✅ 无需额外配置
- ✅ 与 GitLab 深度集成
- ✅ 自动使用 CI 预定义变量
- ✅ 支持私有镜像

如果选择自建 Registry，需要提供：
- Registry URL（如 `registry.example.com:5000`）
- 用户名
- 密码

如果选择"不使用 Registry"，镜像将在服务器本地构建。

### 3. 项目配置

```
🔧 项目配置

? 项目名称 (用于容器名称): my-project
? 项目类型: NestJS 后端
? 镜像名称 (可选，留空将使用 GitLab 项目路径): [留空]
? 部署目录 (服务器上的绝对路径): /www/wwwroot/my-project
? 开发环境端口: 3000
? 生产环境端口: 3001
? 开发环境 URL (可选): https://my-project-test.example.com
? 生产环境 URL (可选): https://my-project.example.com
```

**配置说明：**
- **项目名称**：用于 Docker 容器名称，只能包含小写字母、数字和连字符
- **项目类型**：影响默认的 lint 命令和构建流程
- **镜像名称**：使用 GitLab Registry 时可以留空，会自动使用项目路径
- **部署目录**：必须是服务器上的绝对路径，工具会在此目录部署项目
- **端口**：应用监听的端口，确保不与其他服务冲突
- **URL**：可选，用于 GitLab 环境链接展示

### 4. 服务器配置

```
🖥️  服务器配置

? 是否使用单服务器多环境模式？ Yes
? 测试/开发服务器地址 (IP 或域名): 192.168.1.100
? 生产服务器地址: [自动填充相同地址]
```

**配置说明：**
- **单服务器多环境模式**：开发和生产环境部署在同一台服务器，通过不同端口区分
- **双服务器模式**：开发和生产环境部署在不同服务器，更安全但成本更高

### 5. SSH 私钥配置

```
🔑 SSH 私钥配置

? 如何提供 SSH 私钥？
  ❯ 从文件读取
    手动粘贴

? SSH 私钥文件路径: ~/.ssh/gitlab-ci-deploy
```

**配置说明：**
- **从文件读取**：推荐方式，直接指定私钥文件路径
- **手动粘贴**：会打开编辑器，粘贴私钥内容后保存

**注意**：
- 私钥必须是 PEM 格式
- 不需要 base64 编码
- 私钥内容会安全地存储在 GitLab CI/CD 变量中（Masked）

### 6. 环境变量文件（必需）

```
📄 环境变量文件配置（必需）

⚠️  NestJS 项目需要 .env 文件来配置数据库、密钥等信息
   请确保已创建 .env.dev 和 .env.prod 文件

? 开发环境 .env 文件路径 (必需): .env.dev
✓ 成功读取 .env.dev (25 行)

? 生产环境 .env 文件路径 (必需): .env.prod
✓ 成功读取 .env.prod (25 行)
```

**配置说明：**
- 环境变量文件是**必需的**，不能跳过
- 如果文件不存在，工具会提示你先创建
- 工具会读取文件内容并上传到 GitLab CI/CD 变量（File 类型）
- 部署时会自动注入到容器中

## 配置完成

工具会自动完成以下操作：

### 1. 生成配置文件

```
your-project/
├── .gitlab-ci.yml          # GitLab CI/CD 配置
├── docker-compose.yml      # Docker Compose 配置（如果不存在）
└── ci/
    ├── deploy.sh           # 部署脚本
    └── generate-env.sh     # 环境变量生成脚本
```

**文件说明：**
- **`.gitlab-ci.yml`**：定义 CI/CD Pipeline 流程，包括 lint、build、deploy 阶段
- **`docker-compose.yml`**：定义 Docker 容器配置，用于本地和服务器部署
- **`ci/deploy.sh`**：部署脚本，在服务器上执行，负责拉取镜像、启动容器等
- **`ci/generate-env.sh`**：环境变量生成脚本，从 GitLab 变量中提取 .env 文件

### 2. 上传 CI/CD 变量到 GitLab

工具会自动选择一个 GitLab 项目，并上传以下变量：

| 变量名 | 类型 | 说明 | Protected | Masked |
|--------|------|------|-----------|--------|
| `GITLAB_ACCESS_TOKEN` | env_var | GitLab Personal Access Token | ✓ | ✓ |
| `SSH_PRIVATE_KEY` | env_var | 服务器 SSH 私钥（PEM 格式原始内容） | ✓ | ✓ |
| `TEST_SERVER_HOST` | env_var | 测试服务器地址 | ✗ | ✗ |
| `PROD_SERVER_HOST` | env_var | 生产服务器地址 | ✓ | ✗ |
| `DEV_ENV_FILE` | file | 开发环境 .env 文件内容 | ✓ | ✗ |
| `PROD_ENV_FILE` | file | 生产环境 .env 文件内容 | ✓ | ✗ |

**变量说明：**
- **Protected**：只在受保护的分支（main、develop）可用
- **Masked**：在日志中自动遮蔽，防止泄露
- **File 类型**：变量内容会写入临时文件，可直接作为 .env 使用

**使用 GitLab Container Registry 时会自动使用以下 CI 预定义变量：**
- `$CI_REGISTRY` - Registry URL
- `$CI_REGISTRY_USER` - Registry 用户名
- `$CI_REGISTRY_PASSWORD` - Registry 密码
- `$CI_REGISTRY_IMAGE` - 完整的镜像路径

### 3. 提交到 Git

```bash
# 检查生成的文件
git status

# 添加文件
git add .gitlab-ci.yml docker-compose.yml ci/

# 提交
git commit -m "feat: 添加 GitLab CI/CD 配置"

# 推送到 develop 分支，自动触发部署
git push origin develop
```

## CI/CD 工作流程

### 分支策略

```
main (生产环境)
  ↑
develop (开发环境)
  ↑
feature/* (功能分支)
```

### 自动触发规则

- **develop 分支推送** → 自动部署到开发环境
- **main 分支推送** → 需要在 GitLab 手动触发部署到生产环境
- **其他分支** → 仅运行 lint 检查

### Pipeline 阶段

#### 1. lint - 代码质量检查（所有分支）

```yaml
NestJS: npm run lint:check
Vue/React: npm run type-check
```

在 `node:20-alpine` 容器中执行，使用 npm 缓存加速。

#### 2. build - 构建 Docker 镜像（main/develop）

```yaml
- 使用 Docker Socket Binding（复用宿主机 Docker）
- 拉取最新镜像作为缓存
- 构建新镜像
- 推送到 GitLab Container Registry
- 打上 commit SHA 和 latest 标签
```

使用宿主机 Docker 和镜像缓存，大幅减少构建时间。

**Runner 配置要求**：需要在 `/etc/gitlab-runner/config.toml` 中配置 Docker Socket 挂载：
```toml
[runners.docker]
  volumes = ["/var/run/docker.sock:/var/run/docker.sock", "/cache"]
```

#### 3. deploy - 部署到服务器（main/develop）

```yaml
开发环境（develop 分支）：
  - 使用 rsync 同步代码到服务器
  - 传递 GitLab Registry 凭据
  - 执行 ci/deploy.sh 脚本
  - 自动部署，无需确认

生产环境（main 分支）：
  - 同样的流程
  - 需要手动触发（when: manual）
  - 增加安全性，避免误部署
```

**部署流程详解：**

1. **同步代码**：使用 rsync 增量同步，只传输变更的文件
2. **登录 Registry**：使用 GitLab 预定义变量自动登录
3. **生成 .env**：从 CI/CD 变量中提取环境变量文件
4. **停止旧容器**：docker-compose down
5. **拉取新镜像**：docker-compose pull
6. **启动新容器**：docker-compose up -d
7. **健康检查**：检查容器是否成功启动

## 常见问题

### 1. SSH 连接失败

**错误**：`Permission denied (publickey)`

**原因**：
- 公钥未添加到服务器
- 私钥格式不正确
- 服务器禁止 root 登录

**解决**：
```bash
# 1. 确认公钥已添加到服务器
ssh -i ~/.ssh/gitlab-ci-deploy root@服务器IP

# 2. 确认私钥格式正确（PEM 格式）
head -n 1 ~/.ssh/gitlab-ci-deploy
# 应该显示: -----BEGIN RSA PRIVATE KEY-----

# 3. 如果服务器禁止 root 登录，修改 /etc/ssh/sshd_config
# PermitRootLogin yes
```

### 2. 环境变量文件未找到

**错误**：`❌ 错误: 文件 .env.dev 不存在`

**解决**：
```bash
# 从示例文件创建
cp .env.example .env.dev
cp .env.example .env.prod

# 编辑文件填写配置
vim .env.dev
vim .env.prod

# 确认文件存在
ls -la .env.dev .env.prod
```

### 3. GitLab Token 权限不足

**错误**：`GitLab 连接失败: Token 无效或已过期`

**原因**：
- Token 权限不足
- Token 已过期
- GitLab URL 不正确

**解决**：
1. 检查 Token 是否有 `api` 和 `write_repository` 权限
2. 重新创建 Token 并设置合理的过期时间
3. 确认 GitLab URL 格式正确（如 `https://gitlab.example.com`）

### 4. 部署后服务无法访问

**原因**：
- 服务器端口未开放
- 防火墙限制
- 容器未成功启动
- 应用内部错误

**解决**：

**方法一：使用宝塔面板配置 Nginx 反向代理（推荐）**
1. 登录宝塔面板
2. 网站 → 添加站点
3. 配置反向代理到 `http://localhost:端口号`
4. 可选：申请 SSL 证书

**方法二：手动开放端口**
```bash
# CentOS/RHEL
firewall-cmd --add-port=3000/tcp --permanent
firewall-cmd --reload

# Ubuntu/Debian
ufw allow 3000/tcp

# 检查端口是否开放
netstat -tlnp | grep 3000
```

**方法三：检查容器日志**
```bash
# SSH 到服务器
ssh root@服务器IP

# 进入部署目录
cd /www/wwwroot/your-project

# 查看容器状态
docker-compose ps

# 查看容器日志
docker-compose logs -f

# 如果容器未启动，查看详细错误
docker-compose up
```

### 5. 构建失败

**错误**：`ERROR: failed to solve: ...`

**原因**：
- Dockerfile 配置错误
- 依赖安装失败
- 网络问题

**解决**：
1. 检查 Dockerfile 语法
2. 确认 package.json 中的依赖正确
3. 查看 GitLab Pipeline 日志详细信息
4. 本地测试构建：`docker build -t test .`

### 6. 如何回滚部署？

**方法一：使用 GitLab 回滚功能**
1. 进入 GitLab 项目 → CI/CD → Pipelines
2. 找到之前成功的 Pipeline
3. 点击 "Retry" 按钮重新部署

**方法二：手动回滚**
```bash
# 进入 GitLab Pipeline → rollback job
# 手动触发回滚任务
```

**方法三：服务器上手动操作**
```bash
ssh root@服务器IP
cd /www/wwwroot/your-project
docker-compose down
# 修改 docker-compose.yml 中的镜像标签为之前的版本
docker-compose up -d
```

## 高级配置

### 自定义 Dockerfile

如果项目需要自定义 Dockerfile，在项目根目录创建，工具生成的 `docker-compose.yml` 会自动使用。

**Dockerfile 示例（NestJS）：**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main"]
```

### 自定义部署脚本

生成的 `ci/deploy.sh` 可以根据需要自定义，例如：
- 添加数据库迁移：`npm run migration:run`
- 添加健康检查：`curl -f http://localhost:3000/health`
- 添加通知：发送企业微信/钉钉通知

### 多环境配置

如果需要更多环境（如 staging、pre-production），可以：
1. 创建新分支（如 `staging`）
2. 在 `.gitlab-ci.yml` 中添加对应的 deploy job
3. 在 GitLab 中添加对应的 CI/CD 变量（如 `STAGING_ENV_FILE`）

## 开发

### 本地开发

```bash
cd clouddreamai-cicd-setup
npm install
npm run build
npm run dev
```

### 发布到 npm

```bash
# 更新版本号
npm version patch  # 或 minor, major

# 编译
npm run build

# 发布
npm publish
```

## License

MIT

## 作者

CloudDreamAI Team
