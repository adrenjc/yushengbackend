/**
 * 商品档案数据模型 - 重新设计基于CSV字段
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

    // === 基本信息 ===
    name: {
      type: String,
      required: [true, "商品名称不能为空"],
      index: true,
      trim: true,
      comment: "商品名称",
    },
    brand: {
      type: String,
      required: [true, "品牌不能为空"],
      index: true,
      trim: true,
      comment: "品牌",
    },

    // === 编码信息 ===
    productCode: {
      type: String,
      index: true,
      trim: true,
      comment: "产品编码",
    },
    boxCode: {
      type: String,
      index: true,
      trim: true,
      comment: "盒码编码",
    },

    // === 产品规格 ===
    productType: {
      type: String,
      trim: true,
      comment: "产品类型(如:烤烟型、混合型等)",
    },
    packageType: {
      type: String,
      trim: true,
      comment: "包装类型(如:条盒硬盒、条盒软盒等)",
    },

    // === 物理规格 ===
    specifications: {
      circumference: {
        type: Number,
        comment: "烟支周长(mm)",
      },
      length: {
        type: String,
        trim: true,
        comment: "烟支长度(如:84.0(30+54) mm)",
      },
      packageQuantity: {
        type: Number,
        comment: "包装数量",
      },
    },

    // === 时间信息 ===
    launchDate: {
      type: Date,
      comment: "上市时间",
    },

    // === 化学成分 ===
    chemicalContent: {
      tarContent: {
        type: Number,
        comment: "焦油含量(mg)",
      },
      nicotineContent: {
        type: Number,
        comment: "烟气烟碱量(mg)",
      },
      carbonMonoxideContent: {
        type: Number,
        comment: "烟气一氧化碳量(mg)",
      },
    },

    // === 外观属性 ===
    appearance: {
      color: {
        type: String,
        trim: true,
        comment: "颜色",
      },
    },

    // === 生产信息 ===
    company: {
      type: String,
      trim: true,
      index: true,
      comment: "所属企业",
    },

    // === 特殊属性 ===
    features: {
      hasPop: {
        type: Boolean,
        default: false,
        comment: "是否爆珠",
      },
    },

    // === 价格信息 ===
    pricing: {
      priceCategory: {
        type: String,
        trim: true,
        enum: ["一类", "二类", "三类", "四类", "五类"],
        comment: "价格类型",
      },
      retailPrice: {
        type: Number,
        min: [0, "零售价不能为负数"],
        comment: "零售价",
      },
      unit: {
        type: String,
        default: "元/条",
        trim: true,
        comment: "单位",
      },
      companyPrice: {
        type: Number,
        min: [0, "公司价不能为负数"],
        comment: "公司价",
      },
    },

    // === 附加信息 ===
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

    // === 批发相关信息 ===
    wholesale: {
      name: {
        type: String,
        trim: true,
        comment: "批发商品名称",
      },
      price: {
        type: Number,
        min: [0, "批发价格不能为负数"],
        comment: "批发价格",
      },
      unit: {
        type: String,
        default: "元/条",
        trim: true,
        comment: "批发价格单位",
      },
      updatedAt: {
        type: Date,
        comment: "批发价格更新时间",
      },
      source: {
        type: String,
        enum: ["manual", "matching", "import"],
        default: "matching",
        comment: "批发价格来源",
      },
      // 关联的匹配记录
      lastMatchingRecord: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MatchingRecord",
        comment: "最后一次匹配记录ID",
      },
    },

    // === 匹配学习相关 ===
    matchingHistory: [
      {
        originalName: String,
        confidence: Number,
        confirmedAt: Date,
        confirmedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    // === 状态管理 ===
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

    // === 元数据 ===
    metadata: {
      source: {
        type: String,
        enum: ["manual", "import", "system"],
        default: "manual",
      },
      importBatch: String,
      lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// === 索引配置 ===
ProductSchema.index({ name: "text", brand: "text", keywords: "text" })
ProductSchema.index({ brand: 1, company: 1 })
ProductSchema.index({ "pricing.retailPrice": 1 })
ProductSchema.index({ "pricing.priceCategory": 1 })
ProductSchema.index({ productType: 1 })
ProductSchema.index({ isActive: 1, updatedAt: -1 })
// 注释掉重复的索引，因为字段定义中已经有 index: true
// ProductSchema.index({ productCode: 1 })
// ProductSchema.index({ boxCode: 1 })
ProductSchema.index({ launchDate: -1 })

// === 虚拟字段 ===
ProductSchema.virtual("displayName").get(function () {
  const parts = [this.brand, this.name]
  if (this.packageType) {
    parts.push(`(${this.packageType})`)
  }
  return parts.join(" ")
})

ProductSchema.virtual("fullSpecification").get(function () {
  const specs = []
  if (this.specifications?.circumference) {
    specs.push(`周长${this.specifications.circumference}mm`)
  }
  if (this.specifications?.length) {
    specs.push(`长度${this.specifications.length}`)
  }
  if (this.specifications?.packageQuantity) {
    specs.push(`${this.specifications.packageQuantity}支装`)
  }
  return specs.join(" / ")
})

ProductSchema.virtual("chemicalInfo").get(function () {
  if (!this.chemicalContent) return ""
  const info = []
  if (this.chemicalContent.tarContent) {
    info.push(`焦油${this.chemicalContent.tarContent}mg`)
  }
  if (this.chemicalContent.nicotineContent) {
    info.push(`烟碱${this.chemicalContent.nicotineContent}mg`)
  }
  if (this.chemicalContent.carbonMonoxideContent) {
    info.push(`一氧化碳${this.chemicalContent.carbonMonoxideContent}mg`)
  }
  return info.join(" / ")
})

// === 静态方法 ===
ProductSchema.statics.searchProducts = function (query, options = {}) {
  const {
    brand,
    company,
    productType,
    priceCategory,
    priceMin,
    priceMax,
    hasPop,
    limit = 50,
    page = 1,
    sortBy = "updatedAt",
    sortOrder = -1,
  } = options

  const aggregation = []

  // 文本搜索和条码搜索
  if (query) {
    aggregation.push({
      $match: {
        $or: [
          { $text: { $search: query } },
          { productCode: { $regex: query, $options: "i" } },
          { boxCode: { $regex: query, $options: "i" } },
          { name: { $regex: query, $options: "i" } },
          { brand: { $regex: query, $options: "i" } },
        ],
      },
    })
    aggregation.push({
      $addFields: {
        score: {
          $cond: {
            if: { $meta: "textScore" },
            then: { $meta: "textScore" },
            else: 1,
          },
        },
      },
    })
  }

  // 过滤条件
  const matchConditions = { isActive: true }
  if (brand) matchConditions.brand = new RegExp(brand, "i")
  if (company) matchConditions.company = new RegExp(company, "i")
  if (productType) matchConditions.productType = productType
  if (priceCategory) matchConditions["pricing.priceCategory"] = priceCategory
  if (hasPop !== undefined) matchConditions["features.hasPop"] = hasPop

  if (priceMin || priceMax) {
    matchConditions["pricing.retailPrice"] = {}
    if (priceMin) matchConditions["pricing.retailPrice"].$gte = priceMin
    if (priceMax) matchConditions["pricing.retailPrice"].$lte = priceMax
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

// 获取品牌统计
ProductSchema.statics.getBrandStats = function (templateId) {
  return this.aggregate([
    {
      $match: {
        templateId: mongoose.Types.ObjectId(templateId),
        isActive: true,
      },
    },
    { $group: { _id: "$brand", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])
}

// 获取价格分布
ProductSchema.statics.getPriceDistribution = function (templateId) {
  return this.aggregate([
    {
      $match: {
        templateId: mongoose.Types.ObjectId(templateId),
        isActive: true,
      },
    },
    {
      $group: {
        _id: "$pricing.priceCategory",
        count: { $sum: 1 },
        avgPrice: { $avg: "$pricing.retailPrice" },
        minPrice: { $min: "$pricing.retailPrice" },
        maxPrice: { $max: "$pricing.retailPrice" },
      },
    },
    { $sort: { _id: 1 } },
  ])
}

// === 实例方法 ===
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

  if (this.matchingHistory.length > 20) {
    this.matchingHistory = this.matchingHistory.slice(-20)
  }

  return this.save()
}

// === 中间件 ===
ProductSchema.pre("save", function (next) {
  // 自动生成搜索关键词
  if (this.isModified("name") || this.isModified("brand")) {
    const autoKeywords = [
      ...this.name.split(/\s+/),
      ...this.brand.split(/\s+/),
    ].filter((keyword) => keyword.length > 1)

    this.keywords = [...new Set([...(this.keywords || []), ...autoKeywords])]
  }

  next()
})

ProductSchema.pre(
  "deleteOne",
  { document: true, query: false },
  function (next) {
    next()
  }
)

const Product = mongoose.model("Product", ProductSchema)

module.exports = Product
