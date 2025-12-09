# 多阶段构建 Dockerfile - NestJS 项目
# 第一阶段：构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci && npm cache clean --force

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 第二阶段：运行阶段
FROM node:20-alpine AS production

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# 设置工作目录并确保 nestjs 用户拥有完整权限
WORKDIR /app
RUN chown nestjs:nodejs /app

# 从构建阶段复制 node_modules 和构建产物
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

# 切换到非 root 用户
USER nestjs

# 暴露端口
EXPOSE {{APP_PORT}}

# 启动应用
CMD ["node", "dist/main"]
