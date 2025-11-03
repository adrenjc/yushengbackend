#!/usr/bin/env node

/**
 * 文件清理脚本
 * 用于清理项目中的日志文件和临时文件
 */

const fs = require("fs/promises")
const path = require("path")
const { logger } = require("../src/utils/logger")

// 常量配置
const CLEANUP_CONFIG = {
  // 日志文件保留天数
  LOG_RETENTION_DAYS: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
  // 临时文件保留小时数
  TEMP_FILE_RETENTION_HOURS:
    parseInt(process.env.TEMP_FILE_RETENTION_HOURS) || 24,
  // 上传文件保留天数（保留字段，当前未启用）
  UPLOAD_RETENTION_DAYS: parseInt(process.env.UPLOAD_RETENTION_DAYS) || 7,
}

/**
 * 执行文件清理
 */
async function cleanupFiles() {
  try {
    logger.info("开始文件清理任务", CLEANUP_CONFIG)

    const stats = {
      logsDeleted: 0,
      uploadsDeleted: 0,
      totalSizeFreed: 0,
      errors: [],
    }

    await cleanupLogFiles(stats)
    await cleanupTempFiles(stats)
    // await cleanupOldUploads(stats) // 预留扩展点

    logger.info("文件清理任务完成", {
      logsDeleted: stats.logsDeleted,
      uploadsDeleted: stats.uploadsDeleted,
      totalSizeMB: Math.round((stats.totalSizeFreed / 1024 / 1024) * 100) / 100,
      errors: stats.errors.length,
    })

    if (stats.errors.length > 0) {
      logger.warn("文件清理过程中存在错误", { errors: stats.errors })
    }

    return stats
  } catch (error) {
    logger.error("文件清理任务失败", error)
    throw error
  }
}

/**
 * 清理过期日志文件
 */
async function cleanupLogFiles(stats) {
  const logsDir = path.join(__dirname, "../logs")

  if (!(await directoryExists(logsDir))) {
    logger.info("日志目录不存在，跳过日志清理")
    return
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.LOG_RETENTION_DAYS)

  logger.info(`清理 ${cutoffDate.toISOString().split("T")[0]} 之前的日志文件`)

  try {
    const files = await fs.readdir(logsDir)

    for (const file of files) {
      const filePath = path.join(logsDir, file)

      try {
        const stat = await fs.stat(filePath)

        if (!stat.isFile()) continue

        if (stat.mtime < cutoffDate) {
          const fileSize = stat.size
          await fs.unlink(filePath)
          stats.logsDeleted++
          stats.totalSizeFreed += fileSize
          logger.debug(`已删除过期日志文件: ${file}`)
        }
      } catch (error) {
        const message = `删除日志文件失败: ${file} - ${error.message}`
        stats.errors.push(message)
        logger.warn(message)
      }
    }
  } catch (error) {
    stats.errors.push(`读取日志目录失败: ${error.message}`)
  }
}

/**
 * 清理临时上传文件
 */
async function cleanupTempFiles(stats) {
  const uploadsDir = path.join(__dirname, "../uploads")

  if (!(await directoryExists(uploadsDir))) {
    logger.info("上传目录不存在，跳过临时文件清理")
    return
  }

  const cutoffDate = new Date()
  cutoffDate.setHours(
    cutoffDate.getHours() - CLEANUP_CONFIG.TEMP_FILE_RETENTION_HOURS
  )

  logger.info(`清理 ${cutoffDate.toISOString()} 之前的临时文件`)

  try {
    const files = await fs.readdir(uploadsDir)

    for (const file of files) {
      const filePath = path.join(uploadsDir, file)

      try {
        const stat = await fs.stat(filePath)

        if (!stat.isFile()) continue

        const isTempFile =
          file.startsWith("product-upload-") || file.startsWith("temp-")

        if (isTempFile && stat.mtime < cutoffDate) {
          const fileSize = stat.size
          await fs.unlink(filePath)
          stats.uploadsDeleted++
          stats.totalSizeFreed += fileSize
          logger.debug(`已删除临时文件: ${file}`)
        }
      } catch (error) {
        const message = `删除临时文件失败: ${file} - ${error.message}`
        stats.errors.push(message)
        logger.warn(message)
      }
    }
  } catch (error) {
    stats.errors.push(`读取上传目录失败: ${error.message}`)
  }
}

/**
 * 统计目录信息
 */
async function getDirectoryStats(dirPath) {
  if (!(await directoryExists(dirPath))) {
    return { fileCount: 0, totalSize: 0 }
  }

  let fileCount = 0
  let totalSize = 0

  try {
    const files = await fs.readdir(dirPath)

    for (const file of files) {
      const filePath = path.join(dirPath, file)

      try {
        const stat = await fs.stat(filePath)

        if (stat.isFile()) {
          fileCount++
          totalSize += stat.size
        }
      } catch (error) {
        logger.warn(`获取文件信息失败: ${filePath}`, { message: error.message })
      }
    }
  } catch (error) {
    logger.error(`读取目录统计失败: ${dirPath}`, error)
  }

  return { fileCount, totalSize }
}

/**
 * 生成清理报告
 */
async function generateCleanupReport() {
  const logsDir = path.join(__dirname, "../logs")
  const uploadsDir = path.join(__dirname, "../uploads")

  const [logsStats, uploadsStats] = await Promise.all([
    getDirectoryStats(logsDir),
    getDirectoryStats(uploadsDir),
  ])

  const report = {
    timestamp: new Date().toISOString(),
    directories: {
      logs: {
        path: logsDir,
        fileCount: logsStats.fileCount,
        totalSizeMB:
          Math.round((logsStats.totalSize / 1024 / 1024) * 100) / 100,
      },
      uploads: {
        path: uploadsDir,
        fileCount: uploadsStats.fileCount,
        totalSizeMB:
          Math.round((uploadsStats.totalSize / 1024 / 1024) * 100) / 100,
      },
    },
    config: CLEANUP_CONFIG,
  }

  logger.info("当前文件统计", report)
  return report
}

async function directoryExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath)
    return stats.isDirectory()
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn(`检查目录状态失败: ${dirPath}`, { message: error.message })
    }
    return false
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const command = process.argv[2]

  if (command === "--report") {
    generateCleanupReport().catch(console.error)
  } else if (command === "--dry-run") {
    logger.info("执行模拟清理，不实际删除文件")
    generateCleanupReport().catch(console.error)
  } else {
    cleanupFiles().catch(console.error)
  }
}

module.exports = {
  cleanupFiles,
  generateCleanupReport,
  CLEANUP_CONFIG,
}
