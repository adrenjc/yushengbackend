/**
 * 智能匹配系统路由
 */
const express = require("express")
const {
  createMatchingTask,
  executeMatchingTask,
  getMatchingTasks,
  getMatchingTaskById,
  getPendingReviews,
  getAllMatchingRecords,
  reviewMatchingRecord,
  updateOriginalName,
  batchReviewMatchingRecords,
  deleteMatchingTask,
  updateTaskStatus,
  exportMatchingResults,
  getMatchedProducts,
  learnToMemory,
  batchLearnToMemory,
} = require("../controllers/matching.controller")

const {
  authenticateToken,
  authorize,
} = require("../middleware/auth.middleware")
const { validateRequest } = require("../middleware/validation.middleware")
const {
  uploadSingle,
  handleUploadError,
} = require("../middleware/upload.middleware")

const router = express.Router()

/**
 * 任务管理路由
 */

// 获取匹配任务列表
router.get(
  "/tasks",
  authenticateToken,
  authorize("matching.read"),
  getMatchingTasks
)

// 创建匹配任务（上传文件）
router.post(
  "/tasks",
  authenticateToken,
  authorize("matching.create"),
  uploadSingle,
  handleUploadError,
  validateRequest({
    body: require("joi").object({
      templateId: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
      threshold: require("joi").number().min(0).max(100).default(40),
      autoConfirmThreshold: require("joi").number().min(0).max(100).default(65),
      description: require("joi").string().max(500).allow(""),
      priority: require("joi")
        .string()
        .valid("low", "normal", "high", "urgent")
        .default("normal"),
    }),
  }),
  createMatchingTask
)

// 获取匹配任务详情
router.get(
  "/tasks/:id",
  authenticateToken,
  authorize("matching.read"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  }),
  getMatchingTaskById
)

// 执行匹配任务
router.post(
  "/tasks/:id/execute",
  authenticateToken,
  authorize("matching.execute"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  }),
  executeMatchingTask
)

// 删除匹配任务
router.delete(
  "/tasks/:id",
  authenticateToken,
  authorize("matching.delete"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  }),
  deleteMatchingTask
)

// 更新任务状态
router.patch(
  "/tasks/:id/status",
  authenticateToken,
  authorize("matching.read"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  }),
  updateTaskStatus
)

/**
 * 审核管理路由
 */

// 获取待审核记录
router.get(
  "/reviews",
  authenticateToken,
  authorize("matching.review"),
  validateRequest({
    query: require("joi").object({
      taskId: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/),
      page: require("joi").number().integer().min(1).default(1),
      limit: require("joi").number().integer().min(1).max(100).default(20),
      priority: require("joi").string().valid("high", "medium", "low"),
      sortBy: require("joi")
        .string()
        .valid("priority", "score", "confidence", "name")
        .default("priority"),
    }),
  }),
  getPendingReviews
)

// 获取所有匹配记录
router.get(
  "/records",
  authenticateToken,
  authorize("matching.read"),
  validateRequest({
    query: require("joi").object({
      taskId: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/),
      page: require("joi").number().integer().min(1).default(1),
      limit: require("joi").number().integer().min(1).max(1000).default(20),
      status: require("joi")
        .string()
        .valid("pending", "confirmed", "rejected", "exception"),
    }),
  }),
  getAllMatchingRecords
)

// 审核匹配记录
router.post(
  "/records/:id/review",
  authenticateToken,
  authorize("matching.review"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
    body: require("joi").object({
      action: require("joi")
        .string()
        .valid("confirm", "reject", "clear")
        .required(),
      productId: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/),
      note: require("joi").string().max(500).allow(""),
    }),
  }),
  reviewMatchingRecord
)

// 修改匹配记录的原始名称
router.patch(
  "/records/:id/original-name",
  authenticateToken,
  authorize("matching.review"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
    body: require("joi").object({
      originalName: require("joi").string().trim().min(1).max(200).required(),
    }),
  }),
  updateOriginalName
)

// 批量审核匹配记录
router.post(
  "/records/batch-review",
  authenticateToken,
  authorize("matching.review"),
  validateRequest({
    body: require("joi").object({
      recordIds: require("joi")
        .array()
        .items(
          require("joi")
            .string()
            .pattern(/^[0-9a-fA-F]{24}$/)
        )
        .min(1)
        .max(100)
        .required(),
      action: require("joi").string().valid("confirm", "reject").required(),
      productIds: require("joi")
        .array()
        .items(
          require("joi")
            .string()
            .pattern(/^[0-9a-fA-F]{24}$/)
        ),
      note: require("joi").string().max(500).allow(""),
    }),
  }),
  batchReviewMatchingRecords
)

// 导出匹配结果
router.get(
  "/tasks/:taskId/export",
  authenticateToken,
  authorize("matching.view"),
  validateRequest({
    params: require("joi").object({
      taskId: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
    query: require("joi").object({
      format: require("joi").string().valid("excel", "csv").default("excel"),
    }),
  }),
  exportMatchingResults
)

// 获取所有匹配成功的商品
router.get(
  "/products/matched",
  authenticateToken,
  authorize("matching.view"),
  getMatchedProducts
)

/**
 * 记忆库管理路由
 */

// 手动学习记录到记忆库
router.post(
  "/records/:id/learn",
  authenticateToken,
  authorize("matching.review"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
    body: require("joi").object({
      note: require("joi").string().max(500).allow(""),
      confidence: require("joi").number().min(0).max(100),
    }),
  }),
  learnToMemory
)

// 批量学习到记忆库
router.post(
  "/records/batch-learn",
  authenticateToken,
  authorize("matching.review"),
  validateRequest({
    body: require("joi").object({
      recordIds: require("joi")
        .array()
        .items(
          require("joi")
            .string()
            .pattern(/^[0-9a-fA-F]{24}$/)
        )
        .min(1)
        .max(100)
        .required(),
      note: require("joi").string().max(500).allow(""),
    }),
  }),
  batchLearnToMemory
)

module.exports = router
