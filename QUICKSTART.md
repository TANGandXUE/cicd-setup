# 快速开始指南

## 1. 安装依赖

```bash
cd /home/heyi/programs/ultradimension-official-website/backend/scripts/clouddreamai-cicd-setup
npm install
```

## 2. 编译项目

```bash
npm run build
```

## 3. 本地测试

```bash
npm run dev
# 或
npm start
```

## 4. 在项目中使用

### 方式一：全局链接（开发模式）

```bash
# 在 clouddreamai-cicd-setup 目录
npm link

# 在任意项目目录使用
cd /path/to/your/project
cicd-setup init
```

### 方式二：直接运行

```bash
# 在任意项目目录
node /home/heyi/programs/ultradimension-official-website/backend/scripts/clouddreamai-cicd-setup/dist/cli.js init
```

## 5. 使用流程

### 准备工作

1. **GitLab Personal Access Token**
   - 登录 GitLab: https://gitlab.clouddreamai.com
   - 进入 User Settings → Access Tokens
   - 创建 Token，权限选择 `api` 和 `write_repository`
   - 复制 Token 保存好

2. **服务器 SSH 密码**
   - 准备好部署服务器的 SSH 密码

3. **环境变量文件**
   - 准备 `.env.dev` 和 `.env.prod` 文件
   - 包含数据库、Redis、密钥等配置

### 执行配置

```bash
cd /path/to/your/project
cicd-setup init
```

按照提示输入：

1. **GitLab 配置**
   - GitLab URL: `https://gitlab.clouddreamai.com`
   - Personal Access Token: [粘贴你的 Token]

2. **项目配置**
   - 项目名称: 如 `myapp-backend`
   - 项目类型: 选择 NestJS/Vue/React
   - 部署目录: 如 `/www/wwwroot/myapp-backend`
   - 开发环境端口: 如 `3000`
   - 生产环境端口: 如 `3001`

3. **Nginx 反向代理配置（可选）**
   - 是否配置宝塔 Nginx 反向代理
   - 开发环境域名: 如 `test.example.com`
   - 生产环境域名: 如 `prod.example.com`

4. **数据库迁移配置（NestJS 项目）**
   - 是否启用数据库迁移
   - 迁移命令: 默认 `npm run migration:run`

5. **服务器配置**
   - 服务器地址: 如 `192.168.1.100`

6. **SSH 密码**
   - 输入服务器 SSH 密码

7. **环境变量文件**
   - 开发环境 .env 文件路径: `.env.dev`
   - 生产环境 .env 文件路径: `.env.prod`

### 完成后

工具会：
- ✅ 生成 `.gitlab-ci.yml`
- ✅ 生成 `ci/deploy.sh` 和 `ci/generate-env.sh`
- ✅ 上传所有 CI/CD 变量到 GitLab

你需要：
1. 提交生成的文件到 Git 仓库
   ```bash
   git add .gitlab-ci.yml ci/
   git commit -m "feat: 添加 CI/CD 配置"
   git push origin develop  # 或 main
   ```

2. 在 GitLab 查看 Pipeline
   - 进入项目 → CI/CD → Pipelines
   - 查看自动触发的 Pipeline

3. 首次部署可能需要：
   - 在服务器上安装 Docker 和 Docker Compose
   - 配置服务器防火墙开放端口
   - 确保 SSH 密钥认证正常工作

4. **GitLab Runner 配置要求**（重要）：
   - Runner 需要配置 Docker Socket Binding
   - 编辑 `/etc/gitlab-runner/config.toml`：
     ```toml
     [runners.docker]
       volumes = ["/var/run/docker.sock:/var/run/docker.sock", "/cache"]
     ```
   - 重启 Runner：`systemctl restart gitlab-runner`

## 6. 仅生成文件（不上传变量）

如果你只想生成配置文件，稍后手动配置变量：

```bash
cicd-setup init --dry-run
```

## 7. 自定义输出目录

```bash
cicd-setup init --output /path/to/output
```

## 常见问题

### Q: 如何更新已有的 CI/CD 变量？

A: 再次运行 `cicd-setup init`，工具会自动更新（upsert）变量。

### Q: 生成的文件在哪里？

A: 默认在当前目录：
- `./.gitlab-ci.yml`
- `./ci/deploy.sh`
- `./ci/generate-env.sh`

### Q: 如何查看上传的变量？

A: GitLab 项目 → Settings → CI/CD → Variables

### Q: SSH 连接失败怎么办？

A: 检查：
1. 服务器是否允许 root SSH 登录
2. SSH 私钥格式是否正确
3. 服务器防火墙配置
4. 使用 `ssh root@your-server` 测试连接

## 后续优化建议

1. **发布为 npm 包**
   ```bash
   # 登录 npm
   npm login

   # 发布
   npm publish
   ```

2. **添加单元测试**
   - 使用 Jest 或 Vitest
   - 测试 GitLab API 客户端
   - 测试模板生成器

3. **支持更多项目类型**
   - Go
   - Python Django/Flask
   - Java Spring Boot

4. **增强功能**
   - 支持从配置文件导入
   - 支持批量配置多个项目
   - 集成服务器初始化（自动安装 Docker）
