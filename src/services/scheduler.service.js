/**
 * 定时调度器服务
 * 负责系统定时任务的注册与管理
 */

const cron = require("node-cron")
const config = require("../config/env")
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
      logger.warn("定时调度器已初始化，跳过重复初始化")
      return
    }

    if (!config.SCHEDULER || !config.SCHEDULER.ENABLED) {
      logger.info("定时调度器未启用，跳过初始化")
      return
    }

    if (!this.shouldRunOnCurrentInstance()) {
      return
    }

    try {
      // 每天凌晨 3 点执行一次文件清理
      this.scheduleFileCleanup()

      // 每天上午 8 点生成一次存储健康报告
      this.scheduleHealthCheck()

      this.isInitialized = true
      logger.info("定时调度器初始化完成", {
        taskCount: this.tasks.size,
      })
    } catch (error) {
      logger.error("定时调度器初始化失败", error)
      throw error
    }
  }

  /**
   * 判断当前进程是否需要运行调度任务
   */
  shouldRunOnCurrentInstance() {
    const instanceId = process.env.INSTANCE_ID
    const pmId = process.env.pm_id

    const isPrimary =
      (instanceId === undefined || instanceId === "0") &&
      (pmId === undefined || pmId === "0")

    if (!isPrimary) {
      logger.info("当前实例不是主实例，跳过定时任务初始化", {
        instanceId,
        pmId,
      })
      return false
    }

    return true
  }

  /**
   * 注册文件清理任务
   */
  scheduleFileCleanup() {
    const cleanupTask = cron.schedule(
      "0 3 * * *",
      async () => {
        logger.info("开始执行定时文件清理任务")
        try {
          const stats = await cleanupFiles()
          logger.info("定时文件清理完成", stats)
        } catch (error) {
          logger.error("定时文件清理失败", error)
        }
      },
      {
        scheduled: false,
        timezone: config.SCHEDULER.TIMEZONE || "Asia/Shanghai",
      }
    )

    this.tasks.set("fileCleanup", cleanupTask)
    cleanupTask.start()

    logger.info("文件清理任务已注册 - 每天 03:00 执行")
  }

  /**
   * 注册健康检查任务
   */
  scheduleHealthCheck() {
    const healthTask = cron.schedule(
      "0 8 * * *",
      async () => {
        logger.info("开始执行系统存储健康检查")
        try {
          const report = await generateCleanupReport()

          const logsSize = report.directories.logs.totalSizeMB
          const uploadsSize = report.directories.uploads.totalSizeMB

          if (logsSize > 1000) {
            logger.warn("日志目录占用超过阈值", {
              currentSize: logsSize,
              threshold: 1000,
              unit: "MB",
            })
          }

          if (uploadsSize > 500) {
            logger.warn("上传目录占用超过阈值", {
              currentSize: uploadsSize,
              threshold: 500,
              unit: "MB",
            })
          }

          logger.info("系统存储健康检查完成", report)
        } catch (error) {
          logger.error("系统存储健康检查失败", error)
        }
      },
      {
        scheduled: false,
        timezone: config.SCHEDULER.TIMEZONE || "Asia/Shanghai",
      }
    )

    this.tasks.set("healthCheck", healthTask)
    healthTask.start()

    logger.info("存储健康检查任务已注册 - 每天 08:00 执行")
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
   * 获取调度器状态
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
      enabled: Boolean(config.SCHEDULER && config.SCHEDULER.ENABLED),
      initialized: this.isInitialized,
      taskCount: this.tasks.size,
      tasks: taskStatus,
    }
  }

  /**
   * 手动执行文件清理
   */
  async manualCleanup() {
    logger.info("管理员触发手动文件清理")
    try {
      const stats = await cleanupFiles()
      logger.info("手动文件清理完成", stats)
      return stats
    } catch (error) {
      logger.error("手动文件清理失败", error)
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

    logger.info(`自定义任务已注册: ${name}`, {
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

// 导出单例
const schedulerService = new SchedulerService()

module.exports = schedulerService
