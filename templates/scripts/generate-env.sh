#!/bin/bash

# 环境变量生成脚本
# 用法: bash generate-env.sh [environment]
# 示例: bash generate-env.sh production

ENV_TYPE=${1:-development}
ENV_FILE=".env"

echo "正在生成 $ENV_TYPE 环境的环境变量文件..."

# 检查是否在CI环境中运行（通过检查 ENV_FILE_CONTENT 或 CI 变量）
if [ -n "$ENV_FILE_CONTENT" ] || [ -n "$CI" ]; then
  echo "在CI/CD环境中运行，使用CI/CD变量..."

  # 检查是否有文件类型的环境变量
  if [ -n "$ENV_FILE_CONTENT" ]; then
    echo "检测到ENV_FILE_CONTENT变量，直接使用文件内容..."
    echo "$ENV_FILE_CONTENT" > $ENV_FILE
    echo "环境变量文件已生成: $ENV_FILE"
    exit 0
  fi

  # 如果没有文件类型变量，则从单独的CI/CD变量构建
  echo "# 由CI/CD自动生成的环境变量文件 - $(date)" > $ENV_FILE

  # 读取.env.example作为模板
  if [ -f ".env.example" ]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      # 跳过注释和空行
      if [[ $line =~ ^#.*$ ]] || [[ -z $line ]]; then
        echo "$line" >> $ENV_FILE
        continue
      fi

      # 提取变量名
      VAR_NAME=$(echo "$line" | cut -d= -f1)

      # 检查CI/CD变量中是否存在该变量
      VAR_VALUE=$(env | grep "^$VAR_NAME=" | cut -d= -f2-)

      if [ -n "$VAR_VALUE" ]; then
        echo "$VAR_NAME=$VAR_VALUE" >> $ENV_FILE
      else
        # 如果在CI/CD变量中找不到，保留原样
        echo "$line" >> $ENV_FILE
      fi
    done < .env.example
  else
    echo "警告: 未找到 .env.example 文件，将创建一个基本的环境变量文件"
    cat << EOF > $ENV_FILE
# 由CI/CD自动生成的基本环境变量文件 - $(date)
# 应用配置
NODE_ENV=$ENV_TYPE
PORT={{APP_PORT}}
EOF
  fi

else
  # 本地开发环境
  echo "在本地环境中运行，请确保已经创建了.env文件"

  if [ ! -f "$ENV_FILE" ]; then
    echo "警告: $ENV_FILE 文件不存在，将从 .env.example 创建一个副本"

    if [ -f ".env.example" ]; then
      cp .env.example $ENV_FILE
    else
      echo "未找到 .env.example，创建基本环境变量文件"
      cat << EOF > $ENV_FILE
# 本地开发环境变量配置 - $(date)
# 应用配置
NODE_ENV=development
PORT=3000
EOF
    fi

    echo "请编辑 $ENV_FILE 文件并填写必要的环境变量值"
  else
    echo "已检测到 $ENV_FILE 文件，将使用现有文件"
  fi
fi

echo "环境变量配置完成!"
