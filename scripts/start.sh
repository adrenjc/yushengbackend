#!/bin/bash

# 智能商品匹配系统后端启动脚本

echo "🚀 启动智能商品匹配系统后端服务..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查Node.js版本
echo "📋 检查环境..."
node_version=$(node -v 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ 错误: 未安装Node.js"
    echo "请先安装Node.js 18或更高版本"
    exit 1
fi

echo "✅ Node.js版本: $node_version"

# 检查MongoDB连接
echo "🔍 检查MongoDB连接..."
mongo_check=$(mongo --eval "db.runCommand('ping')" --quiet 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "⚠️  警告: 无法连接到MongoDB，请确保MongoDB服务正在运行"
    echo "   默认连接: mongodb://localhost:27017/smartmatch"
fi

# 检查Redis连接
echo "🔍 检查Redis连接..."
redis_check=$(redis-cli ping 2>/dev/null)
if [ "$redis_check" != "PONG" ]; then
    echo "⚠️  警告: 无法连接到Redis，请确保Redis服务正在运行"
    echo "   默认连接: localhost:6379"
fi

# 检查.env文件
if [ ! -f ".env" ]; then
    echo "⚠️  警告: 未找到.env文件"
    echo "🔧 创建默认.env文件..."
    cat > .env << EOL
# 应用配置
NODE_ENV=development
PORT=3001
APP_NAME=智能商品匹配系统

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/smartmatch
MONGODB_TEST_URI=mongodb://localhost:27017/smartmatch_test

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT配置
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# 文件上传配置
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.xlsx,.xls,.csv

# 日志配置
LOG_LEVEL=info
LOG_DIR=./logs

# 匹配算法配置
DEFAULT_MATCH_THRESHOLD=65
AUTO_CONFIRM_THRESHOLD=90
LEARNING_RATE=0.1

# API限制
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOL
    echo "✅ 已创建默认.env文件，请根据需要修改配置"
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖包..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 错误: 依赖安装失败"
        exit 1
    fi
fi

# 创建必要的目录
echo "📁 创建必要的目录..."
mkdir -p logs uploads

# 启动应用
echo "🚀 启动应用..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$1" = "dev" ]; then
    echo "🛠️  以开发模式启动..."
    npm run dev
elif [ "$1" = "pm2" ]; then
    echo "⚙️  使用PM2启动..."
    pm2 start ecosystem.config.js
    pm2 logs
else
    echo "🏁 以生产模式启动..."
    npm start
fi


