# 多阶段构建 Dockerfile - Vue 项目
# 第一阶段：构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci && npm cache clean --force

# 显式复制 .env 文件（绕过 .dockerignore，Vite 构建时需要）
COPY .env .env

# 复制源代码
COPY . .

# 调试：显示 .env 内容确认环境变量正确
RUN cat .env

# 构建应用
RUN npm run build

# 第二阶段：运行阶段 - 使用 Nginx 提供静态文件
FROM nginx:alpine AS production

# 复制构建产物到 Nginx 默认目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置（如果有自定义配置）
# COPY nginx.conf /etc/nginx/nginx.conf

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
