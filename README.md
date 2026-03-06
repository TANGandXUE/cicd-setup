# CloudDreamAI CI/CD Setup

提供 GitLab Token 和服务器 SSH 密码，一键完成从代码集成到生产部署的全流程自动化。

## 特色

**只需一次配置，全自动完成：**

- **CI/CD 流程** - 自动生成 `.gitlab-ci.yml`、`Dockerfile`、`docker-compose.yml`，自动上传变量到 GitLab
- **Nginx 反向代理** - 自动配置宝塔 Nginx，支持 WebSocket
- **SSL 证书** - 自动申请 Let's Encrypt 证书，自动续期
- **数据库** - 自动创建用户和数据库，支持 PostgreSQL / MySQL
- **数据库迁移** - 自动执行 TypeORM / Prisma 迁移
- **Docker** - 服务器无 Docker 时自动安装，部署后自动清理旧镜像
- **健康检测** - 部署后自动检测服务状态，智能诊断常见错误

**支持的框架：** NestJS / Vue / React / Next.js / Node.js

## 命令大全

| 命令 | 说明 |
|------|------|
| `cicd-setup init` | 初始化 CI/CD 配置（交互式） |
| `cicd-setup updateenv` | 更新 GitLab 上的环境变量文件 |
| `cicd-setup update` | 更新 cicd-setup 到最新版本 |

### updateenv

修改本地 `.env.dev` / `.env.prod` 后，同步到 GitLab：

```bash
cicd-setup updateenv

# 指定自定义文件路径
cicd-setup updateenv --dev-file .env.development --prod-file .env.production
```

## 快速开始

### 安装

```bash
npm install -g clouddreamai-cicd-setup
```

### 前置准备

1. **GitLab Token** - 创建 Personal Access Token，需要 `api` 和 `write_repository` 权限
2. **服务器** - 已安装宝塔面板，SSH 可用 root 登录
3. **环境变量文件** - 在项目根目录创建 `.env.dev` 和 `.env.prod`

### 运行

```bash
cd your-project
cicd-setup init
```

按提示填写：
- GitLab URL 和 Token
- 项目名称、类型、端口
- 服务器地址和 SSH 密码
- 数据库配置（可选）
- 域名和 SSL（可选）

完成后会自动：
1. 生成 CI/CD 配置文件
2. 上传变量到 GitLab
3. 推送代码后自动触发部署

### 部署流程

```
develop 分支推送 → 自动部署到开发环境
main 分支推送 → 手动确认后部署到生产环境
```

## License

MIT