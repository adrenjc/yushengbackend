/**
 * 商品管理路由
 */
const express = require("express")
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
  deleteProduct,
  hardDeleteProduct,
  hardDeleteProducts,
  batchOperation,
  searchProducts,
  getProductStats,
  getBrands,
  getCategories,
  getAllProductIds,
  importProducts,
  exportProducts,
  uploadProducts,
} = require("../controllers/product.controller")

const {
  authenticateToken,
  authorize,
} = require("../middleware/auth.middleware")
const { validateRequest } = require("../middleware/validation.middleware")
const {
  uploadSingle,
  handleUploadError,
} = require("../middleware/upload.middleware")
const {
  productCreateSchema,
  productUpdateSchema,
  queryParamsSchema,
  objectIdSchema,
  batchOperationSchema,
} = require("../middleware/validation.middleware")

const router = express.Router()

/**
 * 查询路由
 */

// 获取商品列表
router.get(
  "/",
  authenticateToken,
  authorize("product.read"),
  validateRequest(queryParamsSchema),
  getProducts
)

// 搜索商品
router.get(
  "/search",
  authenticateToken,
  authorize("product.read"),
  validateRequest({
    query: require("joi").object({
      q: require("joi").string().min(1).max(200).required(),
      templateId: require("joi").string().min(1).max(50).required(),
      limit: require("joi").number().integer().min(1).max(100).default(20),
      brand: require("joi").string().max(100).allow(""),
      category: require("joi").string().max(100).allow(""),
      priceMin: require("joi").number().min(0),
      priceMax: require("joi").number().min(0),
    }),
  }),
  searchProducts
)

// 获取商品统计信息
router.get(
  "/stats",
  authenticateToken,
  authorize("product.read"),
  getProductStats
)

// 获取品牌列表
router.get("/brands", authenticateToken, authorize("product.read"), getBrands)

// 获取分类列表
router.get(
  "/categories",
  authenticateToken,
  authorize("product.read"),
  getCategories
)

// 获取所有商品ID列表（用于全选）
router.get(
  "/all-ids",
  authenticateToken,
  authorize("product.read"),
  validateRequest(queryParamsSchema),
  getAllProductIds
)

// 导出商品
router.get(
  "/export",
  authenticateToken,
  authorize("product.read"),
  validateRequest({
    query: require("joi").object({
      format: require("joi").string().valid("json", "csv").default("json"),
      brand: require("joi").string().max(100).allow(""),
      category: require("joi").string().max(100).allow(""),
      isActive: require("joi").string().valid("true", "false"),
    }),
  }),
  exportProducts
)

// 根据ID获取商品详情
router.get(
  "/:id",
  authenticateToken,
  authorize("product.read"),
  validateRequest(objectIdSchema),
  getProductById
)

/**
 * 修改路由
 */

// 创建商品
router.post(
  "/",
  authenticateToken,
  authorize("product.write"),
  validateRequest(productCreateSchema),
  createProduct
)

// 上传文件导入商品
router.post(
  "/upload",
  authenticateToken,
  authorize("product.write"),
  uploadSingle,
  handleUploadError,
  uploadProducts
)

// 批量导入商品
router.post(
  "/import",
  authenticateToken,
  authorize("product.write"),
  validateRequest({
    body: require("joi").object({
      products: require("joi")
        .array()
        .items(
          require("joi").object({
            name: require("joi").string().min(1).max(200).required(),
            brand: require("joi").string().min(1).max(100).required(),
            keywords: require("joi")
              .array()
              .items(require("joi").string().max(50))
              .max(20)
              .default([]),
            category: require("joi").string().max(100).allow(""),
            specifications: require("joi")
              .object({
                packageType: require("joi").string().max(50).allow(""),
                size: require("joi").string().max(50).allow(""),
                price: require("joi").number().min(0).allow(null),
                unit: require("joi").string().max(20).default("盒"),
              })
              .default({}),
            wholesaleName: require("joi").string().max(200).allow(""),
            wholesalePrice: require("joi").number().min(0).allow(null),
            tags: require("joi")
              .array()
              .items(require("joi").string().max(50))
              .max(10)
              .default([]),
          })
        )
        .min(1)
        .max(1000)
        .required(),
      batchId: require("joi").string().max(100).allow(""),
    }),
  }),
  importProducts
)

// 批量操作
router.post(
  "/batch",
  authenticateToken,
  authorize("product.write"),
  validateRequest(batchOperationSchema),
  batchOperation
)

// 更新商品
router.put(
  "/:id",
  authenticateToken,
  authorize("product.write"),
  validateRequest({
    ...objectIdSchema,
    ...productUpdateSchema,
  }),
  updateProduct
)

// 更新商品状态
router.put(
  "/:id/status",
  authenticateToken,
  authorize("product.write"),
  validateRequest({
    ...objectIdSchema,
    body: require("joi").object({
      isActive: require("joi").boolean().required(),
    }),
  }),
  updateProductStatus
)

// 删除商品（软删除）
router.delete(
  "/:id",
  authenticateToken,
  authorize("product.delete"),
  validateRequest(objectIdSchema),
  deleteProduct
)

// 物理删除商品（完全删除）
router.delete(
  "/:id/hard",
  authenticateToken,
  authorize("product.delete"),
  validateRequest(objectIdSchema),
  hardDeleteProduct
)

// 批量物理删除商品
router.post(
  "/hard-delete",
  authenticateToken,
  authorize("product.delete"),
  hardDeleteProducts
)

module.exports = router
