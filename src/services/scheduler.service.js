/**
 * 定时任务服务
 * 管理系统的定时清理和维护任务
 */

const cron = require("node-cron")
const { logger } = require("../utils/logger")
const {
  cleanupFiles,
  generateCleanupReport,
} = require("../../scripts/cleanup-files")

class SchedulerService {
  constructor() {
    this.tasks = new Map()
    this.isInitialized = false
  }

  /**
   * 初始化定时任务
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn("定时任务服务已经初始化")
      return
    }

    try {
      // 每天凌晨3点执行文件清理
      this.scheduleFileCleanup()

      // 每小时生成一次统计报告（可选）
      this.scheduleHealthCheck()

      this.isInitialized = true
      logger.info("定时任务服务初始化成功", {
        taskCount: this.tasks.size,
      })
    } catch (error) {
      logger.error("定时任务服务初始化失败", error)
      throw error
    }
  }

  /**
   * 调度文件清理任务
   */
  scheduleFileCleanup() {
    // 每天凌晨3点执行
    const cleanupTask = cron.schedule(
      "0 3 * * *",
      async () => {
        logger.info("开始执行定时文件清理任务")
        try {
          const stats = await cleanupFiles()
          logger.info("定时文件清理任务完成", stats)
        } catch (error) {
          logger.error("定时文件清理任务失败", error)
        }
      },
      {
        scheduled: false,
        timezone: "Asia/Shanghai",
      }
    )

    this.tasks.set("fileCleanup", cleanupTask)
    cleanupTask.start()

    logger.info("文件清理任务已调度 - 每天凌晨3点执行")
  }

  /**
   * 调度健康检查任务
   */
  scheduleHealthCheck() {
    // 每天早上8点生成报告
    const healthTask = cron.schedule(
      "0 8 * * *",
      async () => {
        logger.info("开始执行系统健康检查")
        try {
          const report = await generateCleanupReport()

          // 检查是否需要告警
          const logsSize = report.directories.logs.totalSizeMB
          const uploadsSize = report.directories.uploads.totalSizeMB

          if (logsSize > 1000) {
            // 日志文件超过1GB
            logger.warn("日志文件大小超过阈值", {
              currentSize: logsSize,
              threshold: 1000,
              unit: "MB",
            })
          }

          if (uploadsSize > 500) {
            // 上传文件超过500MB
            logger.warn("上传文件大小超过阈值", {
              currentSize: uploadsSize,
              threshold: 500,
              unit: "MB",
            })
          }

          logger.info("系统健康检查完成", report)
        } catch (error) {
          logger.error("系统健康检查失败", error)
        }
      },
      {
        scheduled: false,
        timezone: "Asia/Shanghai",
      }
    )

    this.tasks.set("healthCheck", healthTask)
    healthTask.start()

    logger.info("健康检查任务已调度 - 每天早上8点执行")
  }

  /**
   * 停止所有定时任务
   */
  stopAll() {
    for (const [name, task] of this.tasks) {
      task.stop()
      logger.info(`定时任务已停止: ${name}`)
    }

    this.tasks.clear()
    this.isInitialized = false
    logger.info("所有定时任务已停止")
  }

  /**
   * 获取任务状态
   */
  getStatus() {
    const taskStatus = {}

    for (const [name, task] of this.tasks) {
      taskStatus[name] = {
        running: task.running,
        destroyed: task.destroyed,
      }
    }

    return {
      initialized: this.isInitialized,
      taskCount: this.tasks.size,
      tasks: taskStatus,
    }
  }

  /**
   * 手动执行文件清理
   */
  async manualCleanup() {
    logger.info("手动执行文件清理任务")
    try {
      const stats = await cleanupFiles()
      logger.info("手动文件清理任务完成", stats)
      return stats
    } catch (error) {
      logger.error("手动文件清理任务失败", error)
      throw error
    }
  }

  /**
   * 添加自定义任务
   */
  addCustomTask(name, cronExpression, taskFunction, options = {}) {
    if (this.tasks.has(name)) {
      throw new Error(`任务 ${name} 已存在`)
    }

    const task = cron.schedule(cronExpression, taskFunction, {
      scheduled: false,
      timezone: options.timezone || "Asia/Shanghai",
      ...options,
    })

    this.tasks.set(name, task)

    if (options.autoStart !== false) {
      task.start()
    }

    logger.info(`自定义任务已添加: ${name}`, {
      cronExpression,
      autoStart: options.autoStart !== false,
    })

    return task
  }

  /**
   * 移除任务
   */
  removeTask(name) {
    const task = this.tasks.get(name)
    if (task) {
      task.stop()
      this.tasks.delete(name)
      logger.info(`任务已移除: ${name}`)
      return true
    }
    return false
  }
}

// 创建单例实例
const schedulerService = new SchedulerService()

module.exports = schedulerService
