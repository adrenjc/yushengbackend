#!/usr/bin/env node

/**
 * 文件清理脚本
 * 定期清理过期的日志文件和临时文件
 */

const fs = require("fs")
const path = require("path")
const { logger } = require("../src/utils/logger")

// 配置项
const CLEANUP_CONFIG = {
  // 日志文件保留天数
  LOG_RETENTION_DAYS: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
  // 临时文件保留小时数
  TEMP_FILE_RETENTION_HOURS:
    parseInt(process.env.TEMP_FILE_RETENTION_HOURS) || 24,
  // 上传文件保留天数（如果有单独的用户上传文件）
  UPLOAD_RETENTION_DAYS: parseInt(process.env.UPLOAD_RETENTION_DAYS) || 7,
}

/**
 * 清理过期文件
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

    // 清理日志文件
    await cleanupLogFiles(stats)

    // 清理临时上传文件
    await cleanupTempFiles(stats)

    // 清理过期上传文件（如果需要）
    // await cleanupOldUploads(stats)

    logger.info("文件清理任务完成", {
      logsDeleted: stats.logsDeleted,
      uploadsDeleted: stats.uploadsDeleted,
      totalSizeMB: Math.round((stats.totalSizeFreed / 1024 / 1024) * 100) / 100,
      errors: stats.errors.length,
    })

    if (stats.errors.length > 0) {
      logger.warn("清理过程中发生错误", { errors: stats.errors })
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

  if (!fs.existsSync(logsDir)) {
    logger.info("日志目录不存在，跳过日志清理")
    return
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.LOG_RETENTION_DAYS)

  logger.info(`清理 ${cutoffDate.toISOString().split("T")[0]} 之前的日志文件`)

  try {
    const files = fs.readdirSync(logsDir)

    for (const file of files) {
      const filePath = path.join(logsDir, file)
      const stat = fs.statSync(filePath)

      // 只处理文件，不处理目录
      if (!stat.isFile()) continue

      // 检查文件修改时间
      if (stat.mtime < cutoffDate) {
        try {
          const fileSize = stat.size
          fs.unlinkSync(filePath)
          stats.logsDeleted++
          stats.totalSizeFreed += fileSize
          logger.debug(`已删除过期日志文件: ${file}`)
        } catch (error) {
          stats.errors.push(`删除日志文件失败: ${file} - ${error.message}`)
        }
      }
    }
  } catch (error) {
    stats.errors.push(`读取日志目录失败: ${error.message}`)
  }
}

/**
 * 清理临时文件
 */
async function cleanupTempFiles(stats) {
  const uploadsDir = path.join(__dirname, "../uploads")

  if (!fs.existsSync(uploadsDir)) {
    logger.info("上传目录不存在，跳过临时文件清理")
    return
  }

  const cutoffDate = new Date()
  cutoffDate.setHours(
    cutoffDate.getHours() - CLEANUP_CONFIG.TEMP_FILE_RETENTION_HOURS
  )

  logger.info(`清理 ${cutoffDate.toISOString()} 之前的临时文件`)

  try {
    const files = fs.readdirSync(uploadsDir)

    for (const file of files) {
      const filePath = path.join(uploadsDir, file)
      const stat = fs.statSync(filePath)

      // 只处理文件，不处理目录
      if (!stat.isFile()) continue

      // 检查是否为临时文件（以特定前缀命名）
      if (file.startsWith("product-upload-") || file.startsWith("temp-")) {
        // 检查文件修改时间
        if (stat.mtime < cutoffDate) {
          try {
            const fileSize = stat.size
            fs.unlinkSync(filePath)
            stats.uploadsDeleted++
            stats.totalSizeFreed += fileSize
            logger.debug(`已删除临时文件: ${file}`)
          } catch (error) {
            stats.errors.push(`删除临时文件失败: ${file} - ${error.message}`)
          }
        }
      }
    }
  } catch (error) {
    stats.errors.push(`读取上传目录失败: ${error.message}`)
  }
}

/**
 * 获取目录大小统计
 */
function getDirectoryStats(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { fileCount: 0, totalSize: 0 }
  }

  let fileCount = 0
  let totalSize = 0

  try {
    const files = fs.readdirSync(dirPath)

    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const stat = fs.statSync(filePath)

      if (stat.isFile()) {
        fileCount++
        totalSize += stat.size
      }
    }
  } catch (error) {
    logger.error(`获取目录统计失败: ${dirPath}`, error)
  }

  return { fileCount, totalSize }
}

/**
 * 生成清理报告
 */
async function generateCleanupReport() {
  const logsDir = path.join(__dirname, "../logs")
  const uploadsDir = path.join(__dirname, "../uploads")

  const logsStats = getDirectoryStats(logsDir)
  const uploadsStats = getDirectoryStats(uploadsDir)

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

// 如果直接运行此脚本
if (require.main === module) {
  const command = process.argv[2]

  if (command === "--report") {
    generateCleanupReport().catch(console.error)
  } else if (command === "--dry-run") {
    logger.info("执行模拟清理（不实际删除文件）")
    // 可以实现一个只显示将要删除的文件的功能
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
