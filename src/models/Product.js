/**
 * 商品档案数据模型
 */
const mongoose = require("mongoose")

const ProductSchema = new mongoose.Schema(
  {
    // 模板关联
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductTemplate",
      required: true,
      index: true,
    },

    // 基本信息
    name: {
      type: String,
      required: [true, "商品名称不能为空"],
      index: true,
      trim: true,
    },
    brand: {
      type: String,
      required: [true, "品牌不能为空"],
      index: true,
      trim: true,
    },
    keywords: [
      {
        type: String,
        index: true,
        trim: true,
      },
    ],
    category: {
      type: String,
      index: true,
      trim: true,
    },

    // 编码信息
    boxCode: {
      type: String,
      trim: true,
      index: true, // 盒码
    },
    barcode: {
      type: String,
      trim: true,
      index: true, // 条码
    },
    companyPrice: {
      type: Number,
      min: [0, "公司价不能为负数"], // 公司价
    },

    // 规格信息
    specifications: {
      packageType: {
        type: String,
        trim: true, // 包装类型：盒、条、包等
      },
      size: {
        type: String,
        trim: true, // 规格：20支、10包等
      },
      price: {
        type: Number,
        min: [0, "价格不能为负数"], // 建议零售价
      },
      unit: {
        type: String,
        default: "盒",
        trim: true, // 单位
      },
    },

    // 批发相关信息
    wholesaleName: {
      type: String,
      trim: true, // 批发商品名称
    },
    wholesalePrice: {
      type: Number,
      min: [0, "批发价格不能为负数"],
    },

    // 匹配学习相关
    matchingHistory: [
      {
        originalName: String, // 原始口语化名称
        confidence: Number, // 匹配置信度
        confirmedAt: Date, // 确认时间
        confirmedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    // 状态管理
    isActive: {
      type: Boolean,
      default: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    // 元数据
    metadata: {
      source: {
        type: String,
        enum: ["manual", "import", "system"],
        default: "manual",
      },
      importBatch: String, // 导入批次号
      lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  {
    timestamps: true, // 自动添加createdAt和updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// 创建复合索引
ProductSchema.index({ name: "text", brand: "text", keywords: "text" }) // 全文搜索
ProductSchema.index({ brand: 1, category: 1 }) // 品牌和分类组合查询
ProductSchema.index({ "specifications.price": 1 }) // 价格范围查询
ProductSchema.index({ isActive: 1, updatedAt: -1 }) // 活跃商品排序

// 虚拟字段：完整显示名称
ProductSchema.virtual("displayName").get(function () {
  const parts = [this.brand, this.name]
  if (this.specifications?.packageType) {
    parts.push(`(${this.specifications.packageType})`)
  }
  return parts.join(" ")
})

// 虚拟字段：搜索关键词
ProductSchema.virtual("searchKeywords").get(function () {
  const keywords = [
    this.name,
    this.brand,
    ...(this.keywords || []),
    this.specifications?.packageType,
    this.specifications?.size,
  ].filter(Boolean)

  return keywords.join(" ")
})

// 静态方法：搜索商品
ProductSchema.statics.searchProducts = function (query, options = {}) {
  const {
    brand,
    category,
    priceMin,
    priceMax,
    limit = 50,
    page = 1,
    sortBy = "updatedAt",
    sortOrder = -1,
  } = options

  const aggregation = []

  // 文本搜索
  if (query) {
    aggregation.push({
      $match: {
        $text: { $search: query },
      },
    })
    aggregation.push({
      $addFields: {
        score: { $meta: "textScore" },
      },
    })
  }

  // 过滤条件
  const matchConditions = { isActive: true }
  if (brand) matchConditions.brand = brand
  if (category) matchConditions.category = category
  if (priceMin || priceMax) {
    matchConditions["specifications.price"] = {}
    if (priceMin) matchConditions["specifications.price"].$gte = priceMin
    if (priceMax) matchConditions["specifications.price"].$lte = priceMax
  }

  aggregation.push({ $match: matchConditions })

  // 排序
  const sortField = query ? "score" : sortBy
  const sortObj = query
    ? { score: { $meta: "textScore" } }
    : { [sortField]: sortOrder }

  aggregation.push({ $sort: sortObj })

  // 分页
  const skip = (page - 1) * limit
  aggregation.push({ $skip: skip })
  aggregation.push({ $limit: limit })

  return this.aggregate(aggregation)
}

// 静态方法：按品牌获取商品
ProductSchema.statics.getByBrand = function (brand, limit = 20) {
  return this.find({
    brand: new RegExp(brand, "i"),
    isActive: true,
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
}

// 静态方法：相似商品推荐
ProductSchema.statics.findSimilar = function (productId, limit = 5) {
  return this.findById(productId).then((product) => {
    if (!product) return []

    return this.find({
      _id: { $ne: productId },
      $or: [
        { brand: product.brand },
        { category: product.category },
        { keywords: { $in: product.keywords || [] } },
      ],
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
  })
}

// 实例方法：更新匹配历史
ProductSchema.methods.addMatchingHistory = function (
  originalName,
  confidence,
  userId
) {
  this.matchingHistory.push({
    originalName,
    confidence,
    confirmedAt: new Date(),
    confirmedBy: userId,
  })

  // 只保留最近20条历史记录
  if (this.matchingHistory.length > 20) {
    this.matchingHistory = this.matchingHistory.slice(-20)
  }

  return this.save()
}

// 中间件：保存前处理
ProductSchema.pre("save", function (next) {
  // 自动生成搜索关键词
  if (this.isModified("name") || this.isModified("brand")) {
    const autoKeywords = [
      ...this.name.split(/\s+/),
      ...this.brand.split(/\s+/),
    ].filter((keyword) => keyword.length > 1)

    // 合并现有关键词，去重
    this.keywords = [...new Set([...(this.keywords || []), ...autoKeywords])]
  }

  next()
})

// 中间件：删除前清理
ProductSchema.pre(
  "deleteOne",
  { document: true, query: false },
  function (next) {
    // 这里可以添加删除前的清理逻辑
    // 比如检查是否有相关的匹配记录等
    next()
  }
)

const Product = mongoose.model("Product", ProductSchema)

module.exports = Product
