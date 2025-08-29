/**
 * 日志工具模块
 * 提供统一的日志记录功能
 */
const fs = require("fs")
const path = require("path")

// 日志级别
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
}

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || "INFO"
    this.logsDir = path.join(process.cwd(), "logs")
    this.ensureLogsDirectory()
  }

  /**
   * 确保日志目录存在
   */
  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true })
    }
  }

  /**
   * 格式化日志消息
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString()
    const metaStr =
      Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ""
    return `[${timestamp}] [${level}] ${message}${metaStr}`
  }

  /**
   * 写入日志文件
   */
  writeToFile(level, message, meta = {}) {
    const logFile = path.join(
      this.logsDir,
      `${new Date().toISOString().split("T")[0]}.log`
    )
    const logMessage = this.formatMessage(level, message, meta) + "\n"

    try {
      fs.appendFileSync(logFile, logMessage)
    } catch (error) {
      console.error("Failed to write to log file:", error)
    }
  }

  /**
   * 记录日志
   */
  log(level, message, meta = {}) {
    const levelValue = LOG_LEVELS[level] || LOG_LEVELS.INFO
    const currentLevelValue = LOG_LEVELS[this.logLevel] || LOG_LEVELS.INFO

    if (levelValue <= currentLevelValue) {
      const formattedMessage = this.formatMessage(level, message, meta)

      // 输出到控制台
      if (level === "ERROR") {
        console.error(formattedMessage)
      } else if (level === "WARN") {
        console.warn(formattedMessage)
      } else {
        console.log(formattedMessage)
      }

      // 写入文件
      this.writeToFile(level, message, meta)
    }
  }

  /**
   * 错误日志
   */
  error(message, meta = {}) {
    this.log("ERROR", message, meta)
  }

  /**
   * 警告日志
   */
  warn(message, meta = {}) {
    this.log("WARN", message, meta)
  }

  /**
   * 信息日志
   */
  info(message, meta = {}) {
    this.log("INFO", message, meta)
  }

  /**
   * 调试日志
   */
  debug(message, meta = {}) {
    this.log("DEBUG", message, meta)
  }
}

// 创建全局logger实例
const logger = new Logger()

/**
 * 记录操作日志
 */
function logOperation(operation, user, details = {}) {
  const logData = {
    operation,
    userId: user?.userId || user?._id || "unknown",
    username: user?.username || "unknown",
    timestamp: new Date().toISOString(),
    details,
  }

  logger.info(`Operation: ${operation}`, logData)
}

/**
 * 记录匹配日志
 */
function logMatching(query, results, performance = {}) {
  const logData = {
    query,
    resultsCount: results?.length || 0,
    performance,
    timestamp: new Date().toISOString(),
  }

  logger.info(`Matching: ${query}`, logData)
}

/**
 * HTTP日志流 (用于Express中间件)
 */
const httpLogStream = {
  write: (message) => {
    // 移除换行符并记录HTTP请求
    logger.info(`HTTP: ${message.trim()}`)
  },
}

module.exports = {
  logger,
  logOperation,
  logMatching,
  httpLogStream,
}
