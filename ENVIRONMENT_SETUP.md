# 🔧 环境变量配置指南

## 📋 概述

后端项目现在支持根据环境自动加载不同的配置文件：

- **开发环境**：`.env.development`
- **生产环境**：`.env.production`
- **回退配置**：`.env`（如果环境特定文件不存在）

## 🚀 快速设置

### 1️⃣ 创建环境变量文件

```bash
# 创建开发环境配置
npm run setup:env

# 或手动创建
cp .env.example .env.development
cp .env.example .env.production
```

### 2️⃣ 配置环境变量

根据不同环境修改相应的配置文件。

## 📁 环境变量文件模板

### `.env.development` (开发环境)

```env
# ===========================================
# 应用基础配置
# ===========================================
NODE_ENV=development
PORT=8080
APP_NAME=智能商品匹配系统

# ===========================================
# 数据库配置
# ===========================================
MONGODB_URI=mongodb://localhost:27017/smartmatch
MONGODB_TEST_URI=mongodb://localhost:27017/smartmatch_test

# ===========================================
# Redis配置（开发环境可选）
# ===========================================
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# ===========================================
# JWT安全配置（开发环境）
# ===========================================
JWT_SECRET=dev-jwt-secret-key-for-development-only
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# ===========================================
# 文件上传配置
# ===========================================
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.xlsx,.xls,.csv

# ===========================================
# 日志配置
# ===========================================
LOG_LEVEL=debug
LOG_DIR=logs

# ===========================================
# 匹配算法配置
# ===========================================
DEFAULT_MATCH_THRESHOLD=65
AUTO_CONFIRM_THRESHOLD=90
LEARNING_RATE=0.1

# ===========================================
# API限制配置（开发环境宽松）
# ===========================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# ===========================================
# 文件清理配置
# ===========================================
LOG_RETENTION_DAYS=7
TEMP_FILE_RETENTION_HOURS=24
UPLOAD_RETENTION_DAYS=3
```

### `.env.production` (生产环境)

```env
# ===========================================
# 应用基础配置
# ===========================================
NODE_ENV=production
PORT=8080
APP_NAME=智能商品匹配系统

# ===========================================
# 数据库配置
# ===========================================
MONGODB_URI=mongodb://localhost:27017/smartmatch_prod
MONGODB_TEST_URI=mongodb://localhost:27017/smartmatch_test

# ===========================================
# Redis配置（生产环境推荐启用）
# ===========================================
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0

# ===========================================
# JWT安全配置（生产环境 - 请修改为随机字符串）
# ===========================================
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-random-string
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# ===========================================
# 文件上传配置
# ===========================================
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.xlsx,.xls,.csv

# ===========================================
# 日志配置
# ===========================================
LOG_LEVEL=info
LOG_DIR=logs

# ===========================================
# 匹配算法配置
# ===========================================
DEFAULT_MATCH_THRESHOLD=75
AUTO_CONFIRM_THRESHOLD=90
LEARNING_RATE=0.1

# ===========================================
# API限制配置（生产环境严格）
# ===========================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ===========================================
# 文件清理配置
# ===========================================
LOG_RETENTION_DAYS=30
TEMP_FILE_RETENTION_HOURS=24
UPLOAD_RETENTION_DAYS=7
```

## 🔐 安全注意事项

### 🚨 生产环境必须修改的配置

1. **JWT_SECRET**：使用强随机字符串

   ```bash
   # 生成安全的JWT密钥
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **数据库连接**：使用生产数据库
3. **Redis 密码**：设置强密码
4. **日志级别**：设置为 `info` 或 `warn`

### 📁 文件权限

```bash
# 设置环境变量文件权限
chmod 600 .env.production
chmod 600 .env.development
```

## 🛠️ 环境检测

项目启动时会自动检测并加载对应的环境变量文件：

```javascript
// 配置优先级：
// 1. .env.production (NODE_ENV=production)
// 2. .env.development (NODE_ENV=development)
// 3. .env (回退配置)
```

## 📊 环境对比

| 配置项                  | 开发环境 | 生产环境 |
| ----------------------- | -------- | -------- |
| LOG_LEVEL               | debug    | info     |
| JWT_EXPIRES_IN          | 24h      | 8h       |
| RATE_LIMIT_MAX_REQUESTS | 1000     | 100      |
| DEFAULT_MATCH_THRESHOLD | 65       | 75       |
| REDIS_ENABLED           | false    | true     |
| LOG_RETENTION_DAYS      | 7        | 30       |

## 🚀 启动命令

```bash
# 开发环境启动
npm run dev              # 自动加载 .env.development

# 生产环境启动
npm run prod             # 自动加载 .env.production
NODE_ENV=production npm start

# PM2生产环境启动
npm run pm2:start        # ecosystem.config.js 中设置 NODE_ENV=production
```

## 🔍 故障排查

### 检查环境变量加载

```javascript
// 在代码中检查
console.log("NODE_ENV:", process.env.NODE_ENV)
console.log("配置加载:", require("./src/config/env"))
```

### 验证配置文件

```bash
# 检查文件是否存在
ls -la .env*

# 检查文件内容（注意不要泄露密钥）
head .env.development
```

---

## 🎯 最佳实践

1. **版本控制**：`.env.*` 文件应添加到 `.gitignore`
2. **备份配置**：生产环境配置做好备份
3. **定期更新**：定期更换 JWT 密钥等敏感信息
4. **环境隔离**：确保不同环境使用独立的数据库
5. **配置验证**：启动时验证关键配置项是否正确设置
