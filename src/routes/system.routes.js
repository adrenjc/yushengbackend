/**
 * 系统管理路由
 * 提供系统维护和监控功能
 */

const express = require("express")
const router = express.Router()

// 分步导入以避免循环依赖和初始化问题
let asyncHandler,
  authenticateToken,
  authorize,
  logger,
  schedulerService,
  generateCleanupReport

try {
  const errorMiddleware = require("../middleware/error.middleware")
  asyncHandler = errorMiddleware.asyncHandler

  const authMiddleware = require("../middleware/auth.middleware")
  authenticateToken = authMiddleware.authenticateToken
  authorize = authMiddleware.authorize

  const loggerModule = require("../utils/logger")
  logger = loggerModule.logger

  schedulerService = require("../services/scheduler.service")

  const cleanupModule = require("../../scripts/cleanup-files")
  generateCleanupReport = cleanupModule.generateCleanupReport
} catch (error) {
  console.error("Error loading system route dependencies:", error.message)
  // 创建占位符函数以避免 undefined 错误
  asyncHandler =
    asyncHandler ||
    ((fn) => (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next))
  authenticateToken = authenticateToken || ((req, res, next) => next())
  authorize = authorize || (() => (req, res, next) => next())
}

/**
 * 获取系统状态
 */
router.get(
  "/status",
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const schedulerStatus = schedulerService
        ? schedulerService.getStatus()
        : { status: "not available" }
      const report = generateCleanupReport
        ? await generateCleanupReport()
        : { status: "not available" }

      res.json({
        success: true,
        data: {
          system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version,
            platform: process.platform,
          },
          scheduler: schedulerStatus,
          storage: report,
        },
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "获取系统状态失败",
        error: error.message,
      })
    }
  })
)

/**
 * 手动执行文件清理
 */
router.post(
  "/cleanup",
  authenticateToken,
  authorize ? authorize(["admin"]) : (req, res, next) => next(),
  asyncHandler(async (req, res) => {
    try {
      if (logger && logger.info) {
        logger.info("管理员手动触发文件清理", {
          userId: req.user?._id,
          username: req.user?.username,
        })
      }

      const stats =
        schedulerService && schedulerService.manualCleanup
          ? await schedulerService.manualCleanup()
          : { message: "清理服务不可用" }

      res.json({
        success: true,
        message: "文件清理任务执行完成",
        data: {
          stats,
          executedBy: {
            userId: req.user?._id,
            username: req.user?.username,
          },
          executedAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "文件清理失败",
        error: error.message,
      })
    }
  })
)

/**
 * 获取存储统计报告
 */
router.get(
  "/storage-report",
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const report = generateCleanupReport
        ? await generateCleanupReport()
        : { message: "报告生成服务不可用" }

      res.json({
        success: true,
        data: report,
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "获取存储报告失败",
        error: error.message,
      })
    }
  })
)

/**
 * 获取定时任务状态
 */
router.get(
  "/scheduler",
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const status =
        schedulerService && schedulerService.getStatus
          ? schedulerService.getStatus()
          : { status: "调度服务不可用" }

      res.json({
        success: true,
        data: status,
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "获取调度状态失败",
        error: error.message,
      })
    }
  })
)

module.exports = router
