/**
 * 智能商品匹配系统 - 后端应用程序入口
 */
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const rateLimit = require("express-rate-limit")
const path = require("path")

// 导入配置和工具
const config = require("./config/env")
const database = require("./config/database")
const { redisManager } = require("./config/redis")
const { logger, httpLogStream } = require("./utils/logger")
const schedulerService = require("./services/scheduler.service")
const healthMonitor = require("./utils/health-monitor")

// 导入中间件
const {
  errorHandler,
  notFoundHandler,
  bodyParserErrorHandler,
  databaseErrorHandler,
} = require("./middleware/error.middleware")

// 导入路由
const authRoutes = require("./routes/auth.routes")
const productRoutes = require("./routes/product.routes")
const templateRoutes = require("./routes/template.routes")
const matchingRoutes = require("./routes/matching.routes")
const memoryRoutes = require("./routes/memory.routes")
const userRoutes = require("./routes/user.routes")
const systemRoutes = require("./routes/system.routes")

// 创建Express应用
const app = express()

/**
 * 安全中间件配置
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
)

/**
 * CORS配置
 */
app.use(
  cors({
    origin: function (origin, callback) {
      // 允许的域名列表
      const allowedOrigins = [
        "http://localhost:3000", // 前端开发环境
        "http://localhost:3001", // 后端开发环境
        "https://www.yssh.cc", // 生产环境域名
        "https://yssh.cc", // 生产环境域名（不带www）
      ]

      // 开发环境允许所有来源
      if (config.NODE_ENV === "development") {
        return callback(null, true)
      }

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error("不被CORS策略允许的来源"))
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
)

/**
 * 请求限制中间件 - 已禁用以支持频繁上传和匹配操作
 */
// const limiter = rateLimit({
//   windowMs: config.RATE_LIMIT.windowMs,
//   max: config.RATE_LIMIT.maxRequests,
//   message: {
//     success: false,
//     message: "请求过于频繁，请稍后再试",
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
//   // 跳过成功的请求
//   skipSuccessfulRequests: false,
//   // 跳过失败的请求
//   skipFailedRequests: false,
// })

// app.use("/api/", limiter)

/**
 * 日志中间件
 */
app.use(morgan("combined", { stream: httpLogStream }))

/**
 * 请求解析中间件
 */
app.use(
  express.json({
    limit: "10mb",
    type: ["application/json", "text/plain"],
  })
)
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
)

// 请求体解析错误处理
app.use(bodyParserErrorHandler)

/**
 * 静态文件服务
 */
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

/**
 * 信任代理（如果使用Nginx等反向代理）
 */
if (config.NODE_ENV === "production") {
  app.set("trust proxy", 1)
}

/**
 * 健康检查端点
 */
const handleHealthCheck = async (req, res) => {
  const healthCheck = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
    services: {
      database: "unknown",
      redis: "unknown",
    },
  }

  try {
    // 检查数据库连接
    const databaseHealthy = await database.healthCheck()
    healthCheck.services.database = databaseHealthy ? "healthy" : "unhealthy"

    // 检查Redis连接
    const redisStatus = await redisManager.healthCheck()
    healthCheck.services.redis = redisStatus.status
    if (redisStatus.message) {
      healthCheck.services.redisMessage = redisStatus.message
    }

    const redisHealthy =
      redisStatus.status === "healthy" || redisStatus.status === "disabled"
    const allHealthy = databaseHealthy && redisHealthy

    res.status(allHealthy ? 200 : 503).json(healthCheck)
  } catch (error) {
    healthCheck.status = "ERROR"
    healthCheck.error = error.message
    res.status(503).json(healthCheck)
  }
}

app.get("/health", handleHealthCheck)
app.get("/api/health", handleHealthCheck)

/**
 * 根路径介绍
 */
app.get("/", (req, res) => {
  res.json({
    name: config.APP_NAME,
    version: "1.0.0",
    description: "智能商品匹配系统服务正常运行",
    health: "/health",
    api: "/api",
  })
})

/**
 * API信息端点
 */
app.get("/api", (req, res) => {
  res.json({
    name: config.APP_NAME,
    version: "1.0.0",
    description: "智能商品匹配系统后端API",
    endpoints: {
      auth: "/api/auth",
      products: "/api/products",
      matching: "/api/matching",
      users: "/api/users",
    },
    documentation: "/api/docs",
    health: {
      public: "/health",
      internal: "/api/health",
    },
  })
})

/**
 * API路由配置
 */
app.use("/api/auth", authRoutes)
app.use("/api/products", productRoutes)
app.use("/api/templates", templateRoutes)
app.use("/api/matching", matchingRoutes)
app.use("/api/matching/memories", memoryRoutes)
app.use("/api/users", userRoutes)
app.use("/api/system", systemRoutes)

/**
 * 数据库错误处理中间件
 */
app.use(databaseErrorHandler)

/**
 * 404错误处理
 */
app.use(notFoundHandler)

/**
 * 全局错误处理中间件
 */
app.use(errorHandler)

/**
 * 启动服务器
 */
const startServer = async () => {
  try {
    // 连接数据库
    logger.info("正在连接数据库...")
    await database.connect()

    // 初始化Redis
    logger.info("正在初始化Redis...")
    await redisManager.initialize()

    // 初始化定时任务服务
    if (config.SCHEDULER && config.SCHEDULER.ENABLED) {
      logger.info("正在初始化定时任务服务...")
      await schedulerService.initialize()
    } else {
      logger.info("已跳过定时任务调度器初始化，SCHEDULER_ENABLED 未开启")
    }

    // 启动HTTP服务器
    const server = app.listen(config.PORT, () => {
      logger.info(`服务器启动成功`, {
        port: config.PORT,
        environment: config.NODE_ENV,
        pid: process.pid,
      })

      console.log(`
🚀 ${config.APP_NAME} 后端服务器已启动
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 地址: http://localhost:${config.PORT}
🌐 环境: ${config.NODE_ENV}
📋 健康检查: http://localhost:${config.PORT}/health
📚 API文档: http://localhost:${config.PORT}/api
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `)
    })

    // 优雅关闭处理
    const gracefulShutdown = (signal) => {
      logger.info(`收到 ${signal} 信号，开始优雅关闭...`)

      server.close(async () => {
        logger.info("HTTP服务器已关闭")

        try {
          await database.disconnect()
          logger.info("数据库连接已关闭")

          await redisManager.disconnect()
          logger.info("Redis连接已关闭")

          if (config.SCHEDULER && config.SCHEDULER.ENABLED) {
            schedulerService.stopAll()
            logger.info("定时任务服务已停止")
          }

          logger.info("应用程序已优雅关闭")
          process.exit(0)
        } catch (error) {
          logger.error("优雅关闭过程中出现错误:", error)
          process.exit(1)
        }
      })

      // 设置强制退出定时器
      setTimeout(() => {
        logger.error("强制关闭应用程序")
        process.exit(1)
      }, 30000) // 30秒后强制退出
    }

    // 监听关闭信号
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
    process.on("SIGINT", () => gracefulShutdown("SIGINT"))

    // 启动健康监控（每5分钟检查一次）
    healthMonitor.start(5 * 60 * 1000)

    // 监听未捕获的异常
    process.on("uncaughtException", (error) => {
      logger.error("未捕获的异常:", error)
      healthMonitor.logUncaughtException(error)
      gracefulShutdown("UNCAUGHT_EXCEPTION")
    })

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("未处理的Promise拒绝:", { reason, promise })
      healthMonitor.logUnhandledRejection(reason)
      gracefulShutdown("UNHANDLED_REJECTION")
    })

    return server
  } catch (error) {
    logger.error("服务器启动失败:", error)
    process.exit(1)
  }
}

// 只有在直接运行此文件时才启动服务器
if (require.main === module) {
  startServer()
}

module.exports = { app, startServer }
