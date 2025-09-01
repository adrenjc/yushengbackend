/**
 * 请求数据验证中间件
 */
const Joi = require("joi")
const { logger } = require("../utils/logger")

/**
 * 通用验证中间件
 */
const validateRequest = (schema, options = {}) => {
  return (req, res, next) => {
    try {
      const { body, query, params } = req
      const dataToValidate = {}

      // 根据配置决定验证哪些部分
      if (schema.body) dataToValidate.body = body
      if (schema.query) dataToValidate.query = query
      if (schema.params) dataToValidate.params = params

      const { error, value } = Joi.object(schema).validate(dataToValidate, {
        abortEarly: false, // 返回所有错误
        allowUnknown: options.allowUnknown || false,
        stripUnknown: options.stripUnknown || true,
        ...options,
      })

      if (error) {
        const errorDetails = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          value: detail.context?.value,
        }))

        logger.warn("请求数据验证失败", {
          path: req.path,
          method: req.method,
          errors: errorDetails,
        })

        return res.status(400).json({
          success: false,
          message: "请求数据格式错误",
          errors: errorDetails,
        })
      }

      // 将验证后的数据重新赋值
      if (value.body) req.body = value.body
      if (value.query) req.query = value.query
      if (value.params) req.params = value.params

      next()
    } catch (validationError) {
      logger.error("验证中间件错误:", validationError)
      return res.status(500).json({
        success: false,
        message: "数据验证服务错误",
      })
    }
  }
}

/**
 * 用户注册验证规则
 */
const userRegistrationSchema = {
  body: Joi.object({
    username: Joi.string().min(3).max(50).required().messages({
      "string.min": "用户名至少3个字符",
      "string.max": "用户名不能超过50个字符",
      "any.required": "用户名不能为空",
    }),
    password: Joi.string().min(6).max(128).required().messages({
      "string.min": "密码长度至少6位",
      "string.max": "密码长度不能超过128位",
      "any.required": "密码不能为空",
    }),
    name: Joi.string().min(2).max(50).required().messages({
      "string.min": "姓名至少2个字符",
      "string.max": "姓名不能超过50个字符",
      "any.required": "姓名不能为空",
    }),
    role: Joi.string()
      .valid("admin", "reviewer", "operator", "viewer")
      .default("operator"),
    department: Joi.string().max(100).allow(""),
    position: Joi.string().max(100).allow(""),
  }),
}

/**
 * 用户登录验证规则
 */
const userLoginSchema = {
  body: Joi.object({
    username: Joi.string().min(3).max(50).required().messages({
      "string.min": "用户名至少3个字符",
      "string.max": "用户名不能超过50个字符",
      "any.required": "用户名不能为空",
    }),
    password: Joi.string().required().messages({
      "any.required": "密码不能为空",
    }),
  }),
}

/**
 * 商品创建验证规则
 */
const productCreateSchema = {
  body: Joi.object({
    templateId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "模板ID格式不正确",
        "any.required": "必须指定商品模板",
      }),
    name: Joi.string().min(1).max(200).required().messages({
      "string.min": "商品名称不能为空",
      "string.max": "商品名称不能超过200个字符",
      "any.required": "商品名称不能为空",
    }),
    brand: Joi.string().min(1).max(100).required().messages({
      "string.min": "品牌不能为空",
      "string.max": "品牌不能超过100个字符",
      "any.required": "品牌不能为空",
    }),
    company: Joi.string().max(100).allow(""),
    productCode: Joi.string().max(50).allow(""),
    boxCode: Joi.string().max(50).allow(""),
    productType: Joi.string().max(50).allow(""),
    packageType: Joi.string().max(50).allow(""),
    specifications: Joi.object({
      circumference: Joi.number().min(0).allow(null),
      length: Joi.string().max(100).allow(""),
      packageQuantity: Joi.number().min(0).allow(null),
    }).default({}),
    launchDate: Joi.alternatives().try(
      Joi.date(),
      Joi.string().isoDate(),
      Joi.string().allow("")
    ),
    chemicalContent: Joi.object({
      tarContent: Joi.number().min(0).allow(null),
      nicotineContent: Joi.number().min(0).allow(null),
      carbonMonoxideContent: Joi.number().min(0).allow(null),
    }).default({}),
    appearance: Joi.object({
      color: Joi.string().max(50).allow(""),
    }).default({}),
    features: Joi.object({
      hasPop: Joi.boolean(),
    }).default({}),
    pricing: Joi.object({
      priceCategory: Joi.string().max(50).allow(""),
      retailPrice: Joi.number().min(0).allow(null),
      unit: Joi.string().max(20).allow(""),
      companyPrice: Joi.number().min(0).allow(null),
    }).default({}),
    wholesale: Joi.object({
      name: Joi.string().max(200).allow(""),
      price: Joi.number().min(0).allow(null),
    }).default({}),
    category: Joi.string().max(100).allow(""),
    keywords: Joi.array().items(Joi.string().max(50)).max(20).default([]),
    tags: Joi.array().items(Joi.string().max(50)).max(10).default([]),
    isActive: Joi.boolean().default(true),
  }),
}

/**
 * 商品更新验证规则
 */
const productUpdateSchema = {
  body: Joi.object({
    templateId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
    name: Joi.string().min(1).max(200),
    brand: Joi.string().min(1).max(100),
    company: Joi.string().max(100).allow(""),
    productCode: Joi.string().max(50).allow(""),
    boxCode: Joi.string().max(50).allow(""),
    productType: Joi.string().max(50).allow(""),
    packageType: Joi.string().max(50).allow(""),
    specifications: Joi.object({
      circumference: Joi.number().min(0).allow(null),
      length: Joi.string().max(100).allow(""),
      packageQuantity: Joi.number().min(0).allow(null),
    }),
    launchDate: Joi.alternatives().try(
      Joi.date(),
      Joi.string().isoDate(),
      Joi.string().allow("")
    ),
    chemicalContent: Joi.object({
      tarContent: Joi.number().min(0).allow(null),
      nicotineContent: Joi.number().min(0).allow(null),
      carbonMonoxideContent: Joi.number().min(0).allow(null),
    }),
    appearance: Joi.object({
      color: Joi.string().max(50).allow(""),
    }),
    features: Joi.object({
      hasPop: Joi.boolean(),
    }),
    pricing: Joi.object({
      priceCategory: Joi.string().max(50).allow(""),
      retailPrice: Joi.number().min(0).allow(null),
      unit: Joi.string().max(20).allow(""),
      companyPrice: Joi.number().min(0).allow(null),
    }),
    wholesale: Joi.object({
      name: Joi.string().max(200).allow(""),
      price: Joi.number().min(0).allow(null),
    }),
    category: Joi.string().max(100).allow(""),
    keywords: Joi.array().items(Joi.string().max(50)).max(20),
    tags: Joi.array().items(Joi.string().max(50)).max(10),
    isActive: Joi.boolean(),
  }).min(1), // 至少要有一个字段
}

/**
 * 匹配任务创建验证规则
 */
const matchingTaskCreateSchema = {
  body: Joi.object({
    config: Joi.object({
      threshold: Joi.number().min(0).max(100).default(65),
      autoConfirmThreshold: Joi.number().min(0).max(100).default(90),
      strategies: Joi.object({
        brandPriority: Joi.boolean().default(true),
        keywordMatching: Joi.boolean().default(true),
        packageTypeRecognition: Joi.boolean().default(true),
        priceValidation: Joi.boolean().default(true),
        fuzzyMatching: Joi.boolean().default(true),
      }).default({}),
      weights: Joi.object({
        name: Joi.number().min(0).max(1).default(0.35),
        brand: Joi.number().min(0).max(1).default(0.25),
        keywords: Joi.number().min(0).max(1).default(0.2),
        package: Joi.number().min(0).max(1).default(0.1),
        price: Joi.number().min(0).max(1).default(0.1),
      }).default({}),
    }).default({}),
    metadata: Joi.object({
      priority: Joi.string()
        .valid("low", "normal", "high", "urgent")
        .default("normal"),
      description: Joi.string().max(500).allow(""),
      tags: Joi.array().items(Joi.string().max(50)).max(10).default([]),
    }).default({}),
  }),
}

/**
 * 匹配记录确认验证规则
 */
const matchingConfirmSchema = {
  body: Joi.object({
    productId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "商品ID格式不正确",
        "any.required": "商品ID不能为空",
      }),
    note: Joi.string().max(500).allow(""),
    matchType: Joi.string()
      .valid("auto", "manual", "expert", "new_product")
      .default("manual"),
  }),
}

/**
 * 查询参数验证规则
 */
const queryParamsSchema = {
  query: Joi.object({
    templateId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "模板ID格式不正确",
        "any.required": "必须指定商品模板",
      }),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().max(50).default("createdAt"),
    order: Joi.string().valid("asc", "desc").default("desc"),
    search: Joi.string().max(200).allow(""),
    status: Joi.string().max(50).allow(""),
    startDate: Joi.date().iso().allow(""),
    endDate: Joi.date().iso().min(Joi.ref("startDate")).allow(""),

    // 商品过滤参数
    isActive: Joi.string().valid("true", "false", "all").allow(""),
    brand: Joi.string().max(100).allow(""),
    company: Joi.string().max(100).allow(""),
    productType: Joi.string().max(50).allow(""),
    packageType: Joi.string().max(50).allow(""),
    priceCategory: Joi.string().max(50).allow(""),
    category: Joi.string().max(100).allow(""),
    color: Joi.string().max(50).allow(""),
    hasPop: Joi.string().valid("true", "false", "all").allow(""),

    // 价格范围
    priceMin: Joi.number().min(0).allow(""),
    priceMax: Joi.number().min(0).allow(""),

    // 范围参数（支持对象形式）
    "circumferenceRange.min": Joi.number().min(0).allow(""),
    "circumferenceRange.max": Joi.number().min(0).allow(""),
    "packageQuantityRange.min": Joi.number().min(0).allow(""),
    "packageQuantityRange.max": Joi.number().min(0).allow(""),
    "tarContentRange.min": Joi.number().min(0).allow(""),
    "tarContentRange.max": Joi.number().min(0).allow(""),
    "nicotineContentRange.min": Joi.number().min(0).allow(""),
    "nicotineContentRange.max": Joi.number().min(0).allow(""),
    "retailPriceRange.min": Joi.number().min(0).allow(""),
    "retailPriceRange.max": Joi.number().min(0).allow(""),
    "launchDateRange.start": Joi.string().allow(""),
    "launchDateRange.end": Joi.string().allow(""),
  }),
}

/**
 * MongoDB ObjectId验证规则
 */
const objectIdSchema = {
  params: Joi.object({
    id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "ID格式不正确",
        "any.required": "ID不能为空",
      }),
  }),
}

/**
 * 批量操作验证规则
 */
const batchOperationSchema = {
  body: Joi.object({
    productIds: Joi.array()
      .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
      .min(1)
      .max(1000)
      .required()
      .messages({
        "array.min": "至少选择一个项目",
        "array.max": "批量操作最多支持1000个项目",
        "any.required": "商品ID列表不能为空",
      }),
    operation: Joi.string()
      .valid("confirm", "reject", "delete", "activate", "deactivate")
      .required()
      .messages({
        "any.only": "操作类型不正确",
        "any.required": "操作类型不能为空",
      }),
    templateId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "模板ID格式不正确",
        "any.required": "模板ID不能为空",
      }),
    data: Joi.object().allow(null),
    note: Joi.string().max(500).allow(""),
  }),
}

/**
 * 文件上传验证规则
 */
const fileUploadSchema = {
  query: Joi.object({
    sheetName: Joi.string().max(100).allow(""),
    encoding: Joi.string().valid("utf8", "gbk", "gb2312").default("utf8"),
  }),
}

/**
 * 价格更新验证规则
 */
const priceUpdateSchema = {
  body: Joi.object({
    productId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
    newPrice: Joi.number().min(0).required().messages({
      "number.min": "价格不能为负数",
      "any.required": "新价格不能为空",
    }),
    note: Joi.string().max(500).allow(""),
  }),
}

module.exports = {
  validateRequest,
  userRegistrationSchema,
  userLoginSchema,
  productCreateSchema,
  productUpdateSchema,
  matchingTaskCreateSchema,
  matchingConfirmSchema,
  queryParamsSchema,
  objectIdSchema,
  batchOperationSchema,
  fileUploadSchema,
  priceUpdateSchema,
}
