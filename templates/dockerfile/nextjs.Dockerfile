# 多阶段构建 Dockerfile - Next.js 项目（Standalone 模式）

# 第一阶段：依赖安装
FROM node:20-alpine AS deps
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci && npm cache clean --force

# 第二阶段：构建阶段
FROM node:20-alpine AS builder
WORKDIR /app

# 从 deps 阶段复制 node_modules
COPY --from=deps /app/node_modules ./node_modules

# 显式复制 .env 文件（用于构建时注入 NEXT_PUBLIC_* 环境变量）
# CI 管道会在构建前写入此文件
COPY .env .env

# 调试：确认环境变量已正确写入
RUN cat .env

# 复制源代码
COPY . .

# 构建应用（环境变量从 .env 读取，CI 已写入）
# Standalone 模式会自动优化依赖树
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# 第三阶段：生产运行（Standalone）
FROM node:20-alpine AS production

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# 设置工作目录并确保 nextjs 用户拥有完整权限
WORKDIR /app
RUN chown nextjs:nodejs /app

# 复制 public 目录（静态资源）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 复制 standalone 输出（包含 server.js 和精简的 node_modules）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 复制静态资源（.next/static）
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE {{APP_PORT}}

# 设置端口环境变量
ENV PORT={{APP_PORT}}
ENV NODE_ENV=production

# 启动应用（Standalone 模式使用 server.js）
CMD ["node", "server.js"]
