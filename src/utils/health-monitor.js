/**
 * 健康监控模块
 * 用于诊断服务崩溃前的状态
 */
const fs = require("fs")
const path = require("path")

class HealthMonitor {
  constructor() {
    this.logsDir = path.join(process.cwd(), "logs")
    this.logFile = path.join(this.logsDir, "health-monitor.log")
    this.intervalId = null
    this.warningThreshold = 500 * 1024 * 1024 // 500MB 内存警告阈值
    this.criticalThreshold = 800 * 1024 * 1024 // 800MB 临界阈值
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
   * 获取内存使用情况
   */
  getMemoryUsage() {
    const usage = process.memoryUsage()
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB (Resident Set Size)
      arrayBuffers: Math.round((usage.arrayBuffers || 0) / 1024 / 1024), // MB
    }
  }

  /**
   * 格式化日志消息
   */
  formatLog(level, message, data = {}) {
    const timestamp = new Date().toISOString()
    const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : ""
    return `[${timestamp}] [${level}] ${message}${dataStr}\n`
  }

  /**
   * 写入健康日志（异步）
   */
  writeLog(level, message, data = {}) {
    const logMessage = this.formatLog(level, message, data)

    // 同时输出到控制台
    if (level === "CRITICAL" || level === "WARNING") {
      console.error(logMessage.trim())
    }

    // 异步写入文件
    fs.appendFile(this.logFile, logMessage, (err) => {
      if (err) console.error("Health monitor log write failed:", err.message)
    })
  }

  /**
   * 执行健康检查
   */
  checkHealth() {
    const memory = this.getMemoryUsage()
    const uptime = Math.round(process.uptime())
    const rssBytes = process.memoryUsage().rss

    const healthData = {
      memory,
      uptimeSeconds: uptime,
      uptimeHours: Math.round(uptime / 3600 * 100) / 100,
      pid: process.pid,
      nodeVersion: process.version,
    }

    // 检查内存阈值
    if (rssBytes > this.criticalThreshold) {
      this.writeLog("CRITICAL", "内存使用超过临界阈值！服务可能即将崩溃", healthData)
    } else if (rssBytes > this.warningThreshold) {
      this.writeLog("WARNING", "内存使用较高，请关注", healthData)
    } else {
      // 正常情况下，每小时只记录一次（减少日志量）
      if (uptime % 3600 < 300) {
        this.writeLog("INFO", "健康检查正常", healthData)
      }
    }

    return healthData
  }

  /**
   * 启动定期监控
   * @param {number} intervalMs 检查间隔（毫秒），默认 5 分钟
   */
  start(intervalMs = 5 * 60 * 1000) {
    if (this.intervalId) {
      return // 已经在运行
    }

    // 启动时立即记录一次
    this.writeLog("INFO", "健康监控服务启动", {
      ...this.getMemoryUsage(),
      checkIntervalMinutes: intervalMs / 60000,
    })

    // 定期检查
    this.intervalId = setInterval(() => {
      this.checkHealth()
    }, intervalMs)

    // 确保不会阻止进程退出
    this.intervalId.unref()
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.writeLog("INFO", "健康监控服务停止")
    }
  }

  /**
   * 记录进程退出前的状态
   */
  logShutdown(reason, error = null) {
    const data = {
      reason,
      ...this.getMemoryUsage(),
      uptimeSeconds: Math.round(process.uptime()),
    }

    if (error) {
      data.errorMessage = error.message
      data.errorStack = error.stack
    }

    this.writeLog("CRITICAL", "进程即将退出", data)
  }

  /**
   * 记录未捕获的异常
   */
  logUncaughtException(error) {
    this.writeLog("CRITICAL", "未捕获的异常", {
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
      ...this.getMemoryUsage(),
      uptimeSeconds: Math.round(process.uptime()),
    })
  }

  /**
   * 记录未处理的 Promise 拒绝
   */
  logUnhandledRejection(reason) {
    const errorInfo = reason instanceof Error
      ? { message: reason.message, stack: reason.stack, name: reason.name }
      : { reason: String(reason) }

    this.writeLog("CRITICAL", "未处理的 Promise 拒绝", {
      ...errorInfo,
      ...this.getMemoryUsage(),
      uptimeSeconds: Math.round(process.uptime()),
    })
  }
}

// 导出单例
const healthMonitor = new HealthMonitor()

module.exports = healthMonitor
