#!/usr/bin/env node

/**
 * 环境变量文件设置脚本
 * 自动生成 .env.development 和 .env.production 文件
 */

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

// 生成安全的JWT密钥
function generateJWTSecret() {
  return crypto.randomBytes(64).toString("hex")
}

// 开发环境配置模板
const developmentTemplate = `# 智能商品匹配系统 - 开发环境配置
# 此文件由 npm run setup:env 自动生成

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
JWT_SECRET=${generateJWTSecret()}
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
# 定时任务调度
# ===========================================
SCHEDULER_ENABLED=false
SCHEDULER_TIMEZONE=Asia/Shanghai
# ===========================================
# 文件清理配置
# ===========================================
LOG_RETENTION_DAYS=7
TEMP_FILE_RETENTION_HOURS=24
UPLOAD_RETENTION_DAYS=3
`

// 生产环境配置模板
const productionTemplate = `# 智能商品匹配系统 - 生产环境配置
# 此文件由 npm run setup:env 自动生成
# 🚨 请务必修改 JWT_SECRET 和数据库连接信息

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
REDIS_PASSWORD=your-redis-password-change-this
REDIS_DB=0

# ===========================================
# JWT安全配置（🚨 生产环境请修改密钥）
# ===========================================
JWT_SECRET=${generateJWTSecret()}
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
# 定时任务调度
# ===========================================
SCHEDULER_ENABLED=false
SCHEDULER_TIMEZONE=Asia/Shanghai
# ===========================================
# 文件清理配置
# ===========================================
LOG_RETENTION_DAYS=30
TEMP_FILE_RETENTION_HOURS=24
UPLOAD_RETENTION_DAYS=7
`

// 主函数
async function setupEnvironment() {
  const rootDir = path.join(__dirname, "..")
  const devFile = path.join(rootDir, ".env.development")
  const prodFile = path.join(rootDir, ".env.production")

  console.log("🔧 开始设置环境变量文件...")

  try {
    // 检查文件是否已存在
    const devExists = fs.existsSync(devFile)
    const prodExists = fs.existsSync(prodFile)

    // 创建开发环境文件
    if (!devExists) {
      fs.writeFileSync(devFile, developmentTemplate)
      console.log("✅ 已创建开发环境配置文件: .env.development")
    } else {
      console.log("ℹ️  开发环境配置文件已存在: .env.development")
    }

    // 创建生产环境文件
    if (!prodExists) {
      fs.writeFileSync(prodFile, productionTemplate)
      console.log("✅ 已创建生产环境配置文件: .env.production")
    } else {
      console.log("ℹ️  生产环境配置文件已存在: .env.production")
    }

    // 设置文件权限（仅Linux/Mac）
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(devFile, 0o600)
        fs.chmodSync(prodFile, 0o600)
        console.log("🔒 已设置环境变量文件权限 (600)")
      } catch (err) {
        console.warn("⚠️  设置文件权限失败:", err.message)
      }
    }

    console.log("")
    console.log("🎉 环境变量设置完成！")
    console.log("")
    console.log("📋 后续步骤:")
    console.log("1. 检查并修改 .env.development 中的配置")
    console.log("2. 🚨 务必修改 .env.production 中的敏感信息:")
    console.log("   - JWT_SECRET (已自动生成)")
    console.log("   - MONGODB_URI (生产数据库)")
    console.log("   - REDIS_PASSWORD (Redis密码)")
    console.log("")
    console.log("🚀 启动命令:")
    console.log("  开发环境: npm run dev")
    console.log("  生产环境: npm run prod")
  } catch (error) {
    console.error("❌ 设置环境变量文件失败:", error.message)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  setupEnvironment()
}

module.exports = { setupEnvironment }
