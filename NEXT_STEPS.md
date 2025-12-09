# 🚀 后续测试指南 - 给下一个 AI 的提示词

## 📋 当前状态

我刚刚完成了 **宝塔 Nginx 自动配置功能** 的实现，包括：

### ✅ 已完成的修改

1. **`src/core/types.ts`** - 添加了 `devDomain` 和 `prodDomain` 字段到 `ProjectConfig`
2. **`src/utils/prompts.ts`** - 添加了交互式域名配置询问
3. **`templates/scripts/deploy.sh`** - 添加了 `configure_nginx_proxy()` 函数
4. **`src/utils/template.ts`** - 修改了 `generateDeployScript()` 传递域名变量
5. **编译成功** - TypeScript 代码已成功编译

### 🎯 功能说明

用户运行 `cicd-setup init` 时，会被询问：
```
📝 Nginx 反向代理配置（可选）

? 是否自动配置宝塔 Nginx 反向代理？ Yes
? 开发环境域名 (如 backend-test.example.com): xxx
? 生产环境域名 (如 backend.example.com): xxx
```

部署时，`deploy.sh` 会自动：
1. 检测宝塔是否安装（检查 `/www/server/panel/vhost/nginx/` 目录）
2. 创建 Nginx 配置文件到 `/www/server/panel/vhost/nginx/域名.conf`
3. 配置反向代理到 `http://localhost:端口`
4. 重载 Nginx

---

## 🧪 需要你协助测试

### 测试服务器信息

```bash
服务器: 139.196.13.126
用户: root
密码: nZcTNmVGKxZFB0ZEE+tQhg==
```

连接方式：
```bash
sshpass -p 'nZcTNmVGKxZFB0ZEE+tQhg==' ssh -o StrictHostKeyChecking=no root@139.196.13.126 "命令"
```

### 测试步骤

#### 1. 在用户项目中运行配置工具

```bash
cd /home/heyi/programs/ultradimension-official-website/backend

# 运行配置工具
npx ts-node scripts/clouddreamai-cicd-setup/src/cli.ts init
```

**配置建议：**
- GitLab URL: `https://gitlab.clouddreamai.com`
- 镜像仓库: 选择 `GitLab Container Registry`
- 项目名称: `ultradimension-backend`
- 部署目录: `/www/wwwroot/ultradimension-backend`
- 开发环境端口: `7422`
- 生产环境端口: `7499`
- **是否配置 Nginx**: `Yes`
- **开发环境域名**: `test-backend.clouddreamai.com`
- **生产环境域名**: `backend.clouddreamai.com`

#### 2. 检查生成的文件

```bash
# 检查生成的 deploy.sh 是否包含 Nginx 配置函数
cat ci/deploy.sh | grep -A 30 "configure_nginx_proxy"

# 检查域名是否正确替换
cat ci/deploy.sh | grep "DOMAIN="
```

#### 3. 手动测试部署脚本（在服务器上）

```bash
# 连接服务器
sshpass -p 'nZcTNmVGKxZFB0ZEE+tQhg==' ssh root@139.196.13.126

# 创建测试目录
mkdir -p /www/wwwroot/test-app

# 创建简单的 deploy.sh 测试
cat > /www/wwwroot/test-app/test-deploy.sh << 'EOF'
#!/bin/bash
DOMAIN="test-api.example.com"
PORT="8080"

configure_nginx_proxy() {
    local DOMAIN=$1
    local PORT=$2

    if [ -z "$DOMAIN" ]; then
        echo "跳过 Nginx 配置（未提供域名）"
        return
    fi

    echo "配置 Nginx 反向代理: $DOMAIN -> localhost:$PORT"

    if [ ! -d "/www/server/panel/vhost/nginx" ]; then
        echo "警告：未检测到宝塔面板，跳过 Nginx 配置"
        return
    fi

    cat > /www/server/panel/vhost/nginx/${DOMAIN}.conf << EOFNGINX
# 测试配置 - $(date)
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
    }
}
EOFNGINX

    if command -v nginx &> /dev/null; then
        nginx -t && nginx -s reload
        echo "✓ Nginx 配置已更新并重载"
    fi
}

configure_nginx_proxy "$DOMAIN" "$PORT"
EOF

chmod +x /www/wwwroot/test-app/test-deploy.sh
bash /www/wwwroot/test-app/test-deploy.sh
```

#### 4. 验证 Nginx 配置

```bash
# 检查配置文件是否创建
ls -la /www/server/panel/vhost/nginx/test-api.example.com.conf

# 查看配置内容
cat /www/server/panel/vhost/nginx/test-api.example.com.conf

# 检查 Nginx 是否重载成功
systemctl status nginx
```

#### 5. 清理测试环境

```bash
# 删除测试配置
rm -f /www/server/panel/vhost/nginx/test-api.example.com.conf
nginx -s reload

# 删除测试目录
rm -rf /www/wwwroot/test-app
```

---

## 🐛 可能遇到的问题

### 问题1: 域名字段未正确传递

**检查：**
```bash
cat ci/deploy.sh | grep "{{DEV_DOMAIN}}"
# 如果看到 {{DEV_DOMAIN}}，说明占位符未替换
```

**解决：** 检查 `template.ts` 中的变量名是否一致

### 问题2: Nginx 配置语法错误

**检查：**
```bash
nginx -t
```

**解决：** 检查 `deploy.sh` 中的 EOF heredoc 是否正确转义 `$`

### 问题3: 用户选择不配置 Nginx

**检查：**
```bash
cat ci/deploy.sh | grep 'DOMAIN=""'
# 应该看到空字符串，函数会跳过配置
```

---

## 📝 需要更新的文档

如果测试成功，请更新 `README.md`：

1. 在"配置流程"部分添加 Nginx 反向代理配置说明
2. 在"常见问题"中添加 Nginx 相关问题
3. 示例配置截图

---

## ✅ 验收标准

测试成功的标志：
- ✅ 运行 `cicd-setup init` 会询问域名
- ✅ 生成的 `ci/deploy.sh` 包含 `configure_nginx_proxy` 函数
- ✅ 域名占位符正确替换（不是 `{{DEV_DOMAIN}}`）
- ✅ 在服务器上执行脚本后，Nginx 配置文件被创建
- ✅ Nginx 成功重载，无语法错误
- ✅ 如果用户选择"不配置"，不会创建 Nginx 配置

---

## 🎓 给下一个 AI 的建议

1. **先读取这个文件**了解背景
2. **运行测试步骤** 验证功能
3. **如果有问题** 查看上面的"可能遇到的问题"
4. **测试成功后** 帮用户更新文档并发布 npm 包

用户的目标是让团队成员可以 **零配置使用**，只需：
```bash
npx clouddreamai-cicd-setup init
```

然后按提示操作即可完成 CI/CD 配置 + Nginx 反向代理配置！

---

## 📞 联系方式

如果遇到问题，可以：
1. 查看 GitLab CI/CD Pipeline 日志
2. SSH 到服务器检查 Nginx 日志：`tail -f /www/wwwlogs/域名.log`
3. 检查生成的配置文件是否正确

**祝测试顺利！** 🚀
