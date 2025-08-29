/**
 * 商品模板管理路由
 */
const express = require("express")
const {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  copyTemplate,
  getTemplateStats,
  getTemplateOptions,
  setDefaultTemplate,
} = require("../controllers/template.controller")

const {
  authenticateToken,
  authorize,
} = require("../middleware/auth.middleware")
const { validateRequest } = require("../middleware/validation.middleware")

const router = express.Router()

// 获取模板选项（用于选择器，权限要求较低）
router.get("/options", authenticateToken, getTemplateOptions)

// 获取模板列表
router.get(
  "/",
  authenticateToken,
  authorize("template.view"),
  validateRequest({
    query: require("joi").object({
      page: require("joi").number().integer().min(1).default(1),
      limit: require("joi").number().integer().min(1).max(100).default(20),
      search: require("joi").string().max(100).allow(""),
      category: require("joi").string().max(50).allow(""),
      isActive: require("joi").string().valid("true", "false").allow(""),
      sortBy: require("joi")
        .string()
        .valid("name", "createdAt", "updatedAt")
        .default("updatedAt"),
      sortOrder: require("joi").string().valid("asc", "desc").default("desc"),
    }),
  }),
  getTemplates
)

// 获取模板详情
router.get(
  "/:id",
  authenticateToken,
  authorize("template.view"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  }),
  getTemplateById
)

// 创建模板
router.post(
  "/",
  authenticateToken,
  authorize("template.create"),
  validateRequest({
    body: require("joi").object({
      name: require("joi").string().trim().min(1).max(100).required(),
      description: require("joi").string().max(500).allow("").default(""),
      category: require("joi").string().max(50).default("默认分类"),
      settings: require("joi")
        .object({
          matchingThresholds: require("joi")
            .object({
              autoConfirm: require("joi").number().min(0).max(100).default(65),
              manualReview: require("joi").number().min(0).max(100).default(40),
              expertReview: require("joi").number().min(0).max(100).default(15),
            })
            .default(),
          priceValidation: require("joi").boolean().default(true),
          allowCrossTemplateSearch: require("joi").boolean().default(false),
        })
        .default(),
    }),
  }),
  createTemplate
)

// 更新模板
router.put(
  "/:id",
  authenticateToken,
  authorize("template.update"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
    body: require("joi").object({
      name: require("joi").string().trim().min(1).max(100),
      description: require("joi").string().max(500).allow(""),
      category: require("joi").string().max(50),
      settings: require("joi").object({
        matchingThresholds: require("joi").object({
          autoConfirm: require("joi").number().min(0).max(100),
          manualReview: require("joi").number().min(0).max(100),
          expertReview: require("joi").number().min(0).max(100),
        }),
        priceValidation: require("joi").boolean(),
        allowCrossTemplateSearch: require("joi").boolean(),
      }),
      isActive: require("joi").boolean(),
    }),
  }),
  updateTemplate
)

// 删除模板
router.delete(
  "/:id",
  authenticateToken,
  authorize("template.delete"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  }),
  deleteTemplate
)

// 复制模板
router.post(
  "/:id/copy",
  authenticateToken,
  authorize("template.create"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
    body: require("joi").object({
      name: require("joi").string().trim().min(1).max(100).required(),
    }),
  }),
  copyTemplate
)

// 获取模板统计信息
router.get(
  "/:id/stats",
  authenticateToken,
  authorize("template.view"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  }),
  getTemplateStats
)

// 设置默认模板
router.patch(
  "/:id/default",
  authenticateToken,
  authorize("template.manage"),
  validateRequest({
    params: require("joi").object({
      id: require("joi")
        .string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  }),
  setDefaultTemplate
)

module.exports = router
