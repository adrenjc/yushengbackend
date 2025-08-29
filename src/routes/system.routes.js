/**
 * 系统管理路由
 * 提供系统维护和监控功能
 */

const express = require("express")
const router = express.Router()
const { asyncHandler } = require("../middleware/error.middleware")
const { authenticate, authorize } = require("../middleware/auth.middleware")
const { logger } = require("../utils/logger")
const schedulerService = require("../services/scheduler.service")
const { generateCleanupReport } = require("../../scripts/cleanup-files")

/**
 * 获取系统状态
 */
router.get(
  "/status",
  authenticate,
  asyncHandler(async (req, res) => {
    const schedulerStatus = schedulerService.getStatus()
    const report = await generateCleanupReport()

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
  })
)

/**
 * 手动执行文件清理
 */
router.post(
  "/cleanup",
  authenticate,
  authorize(["admin"]),
  asyncHandler(async (req, res) => {
    logger.info("管理员手动触发文件清理", {
      userId: req.user._id,
      username: req.user.username,
    })

    const stats = await schedulerService.manualCleanup()

    res.json({
      success: true,
      message: "文件清理任务执行完成",
      data: {
        stats,
        executedBy: {
          userId: req.user._id,
          username: req.user.username,
        },
        executedAt: new Date().toISOString(),
      },
    })
  })
)

/**
 * 获取存储统计报告
 */
router.get(
  "/storage-report",
  authenticate,
  asyncHandler(async (req, res) => {
    const report = await generateCleanupReport()

    res.json({
      success: true,
      data: report,
    })
  })
)

/**
 * 获取定时任务状态
 */
router.get(
  "/scheduler",
  authenticate,
  asyncHandler(async (req, res) => {
    const status = schedulerService.getStatus()

    res.json({
      success: true,
      data: status,
    })
  })
)

module.exports = router
