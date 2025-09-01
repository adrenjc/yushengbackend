/**
 * 环境配置管理
 */
const dotenv = require("dotenv")
const path = require("path")

// 根据环境动态加载不同的环境变量文件
dotenv.config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
})

// 如果找不到特定环境文件，则回退到默认 .env 文件
dotenv.config()

const config = {
  // 应用配置
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT) || 8080,
  APP_NAME: process.env.APP_NAME || "智能商品匹配系统",

  // 数据库配置
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://localhost:27017/smartmatch",
  MONGODB_TEST_URI:
    process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/smartmatch_test",

  // Redis配置
  REDIS_ENABLED: process.env.REDIS_ENABLED === "true" || false, // 默认禁用Redis
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  REDIS_DB: parseInt(process.env.REDIS_DB) || 0,

  // JWT配置
  JWT: {
    secret:
      process.env.JWT_SECRET ||
      "your-super-secret-jwt-key-change-this-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  // 文件上传配置
  UPLOAD: {
    dir: process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads"),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || ".xlsx,.xls,.csv").split(
      ","
    ),
  },

  // 日志配置
  LOG: {
    level: process.env.LOG_LEVEL || "info",
    dir: process.env.LOG_DIR || path.join(__dirname, "../../logs"),
  },

  // 匹配算法配置
  MATCHING: {
    defaultThreshold: parseInt(process.env.DEFAULT_MATCH_THRESHOLD) || 65,
    autoConfirmThreshold: parseInt(process.env.AUTO_CONFIRM_THRESHOLD) || 90,
    learningRate: parseFloat(process.env.LEARNING_RATE) || 0.1,
    // 匹配权重配置 - 移除价格权重，只关注名字相似度
    weights: {
      name: 0.5, // 提高名字权重到50%
      brand: 0.3, // 品牌权重30%
      keywords: 0.15, // 关键词权重15%
      package: 0.05, // 包装权重5%
    },
  },

  // API限制配置
  RATE_LIMIT: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15分钟
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },
}

module.exports = config
