/**
 * 匹配记录数据模型
 */
const mongoose = require("mongoose")

const MatchingRecordSchema = new mongoose.Schema(
  {
    // 关联任务
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MatchingTask",
      required: [true, "任务ID不能为空"],
      index: true,
    },

    // 原始数据
    originalData: {
      name: {
        type: String,
        required: [true, "原始商品名称不能为空"],
        trim: true,
        index: true,
      },
      price: {
        type: Number,
        min: [0, "价格不能为负数"],
      },
      quantity: {
        type: Number,
        min: [0, "数量不能为负数"],
      },
      unit: {
        type: String,
        trim: true,
      },
      supplier: {
        type: String,
        trim: true,
      },
      // 原始Excel行数据的其他字段
      rawData: mongoose.Schema.Types.Mixed,
    },

    // 匹配候选项
    candidates: [
      {
        // 候选商品
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },

        // 商品基本信息（冗余存储，提升查询性能）
        name: {
          type: String,
          trim: true,
        },
        brand: {
          type: String,
          trim: true,
        },

        // 匹配得分详情
        score: {
          name: { type: Number, min: 0, max: 100 },
          brand: { type: Number, min: 0, max: 100 },
          keywords: { type: Number, min: 0, max: 100 },
          package: { type: Number, min: 0, max: 100 },
          price: { type: Number, min: 0, max: 100 },
          total: { type: Number, min: 0, max: 100, required: true },
        },

        // 置信度等级
        confidence: {
          type: String,
          enum: ["high", "medium", "low"],
          required: true,
        },

        // 匹配原因说明
        reasons: [
          {
            type: {
              type: String,
              enum: [
                "brand_match",
                "name_similarity",
                "keyword_match",
                "price_range",
                "package_type",
                "manual_selection",
                "memory_match",
              ],
            },
            description: String,
            weight: Number,
          },
        ],

        // 排序权重
        rank: {
          type: Number,
          default: 0,
        },

        // 是否为记忆匹配
        isMemoryMatch: {
          type: Boolean,
          default: false,
        },

        // 记忆匹配源数据（可选）
        memorySource: mongoose.Schema.Types.Mixed,
      },
    ],

    // 选定的匹配结果
    selectedMatch: {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },

      // 商品基本信息（冗余存储，提升查询性能）
      name: {
        type: String,
        trim: true,
      },
      brand: {
        type: String,
        trim: true,
      },

      confidence: Number,
      score: Number,
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      confirmedAt: Date,
      note: String,
      // 匹配类型
      matchType: {
        type: String,
        enum: ["auto", "manual", "expert", "new_product", "memory"],
        default: "auto",
      },

      // 是否为记忆匹配
      isMemoryMatch: {
        type: Boolean,
        default: false,
      },
    },

    // 记录状态
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected", "exception", "skipped"],
      default: "pending",
      required: true,
      index: true,
    },

    // 优先级
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
      index: true,
    },

    // 审核历史
    reviewHistory: [
      {
        action: {
          type: String,
          enum: [
            "assign",
            "review",
            "confirm",
            "reject",
            "reassign",
            "comment",
            "clear",
          ],
          required: true,
        },
        performer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        note: String,
        previousStatus: String,
        newStatus: String,
        // 操作详情
        details: mongoose.Schema.Types.Mixed,
      },
    ],

    // 异常信息
    exceptions: [
      {
        type: {
          type: String,
          enum: [
            "no_candidates",
            "low_confidence",
            "price_mismatch",
            "duplicate_name",
            "parsing_error",
          ],
        },
        message: String,
        severity: {
          type: String,
          enum: ["low", "medium", "high"],
          default: "medium",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        resolvedAt: Date,
        resolvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    // 学习数据
    learningData: {
      // 用户行为模式
      userPatterns: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          action: String,
          timestamp: Date,
          context: mongoose.Schema.Types.Mixed,
        },
      ],

      // 特征提取结果
      extractedFeatures: {
        brand: String,
        size: String,
        packageType: String,
        keywords: [String],
        priceRange: {
          min: Number,
          max: Number,
        },
      },

      // 改进建议
      suggestions: [
        {
          type: String,
          description: String,
          weight: Number,
        },
      ],
    },

    // 处理时间统计
    processingTime: {
      matching: Number, // 匹配耗时(ms)
      review: Number, // 审核耗时(ms)
      total: Number, // 总耗时(ms)
    },

    // 元数据
    metadata: {
      // 数据来源
      source: {
        row: Number, // Excel行号
        sheet: String, // 工作表名
        file: String, // 文件名
      },

      // 标签
      tags: [String],

      // 备注
      notes: [String],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// 复合索引
MatchingRecordSchema.index({ taskId: 1, status: 1 })
MatchingRecordSchema.index({ status: 1, priority: -1, createdAt: 1 })
MatchingRecordSchema.index({
  "selectedMatch.confirmedBy": 1,
  "selectedMatch.confirmedAt": -1,
})
MatchingRecordSchema.index({ "originalData.name": "text" })

// 虚拟字段：最佳候选项
MatchingRecordSchema.virtual("bestCandidate").get(function () {
  if (!this.candidates || this.candidates.length === 0) return null
  return this.candidates.reduce((best, current) =>
    current.score.total > best.score.total ? current : best
  )
})

// 虚拟字段：是否需要人工审核
MatchingRecordSchema.virtual("needsReview").get(function () {
  const bestScore = this.bestCandidate?.score.total || 0
  return bestScore < 90 && bestScore >= 60 // 中等置信度需要审核
})

// 虚拟字段：是否为高风险项
MatchingRecordSchema.virtual("isHighRisk").get(function () {
  const bestScore = this.bestCandidate?.score.total || 0
  return bestScore < 60 || this.exceptions.length > 0
})

// 虚拟字段：审核耗时
MatchingRecordSchema.virtual("reviewDuration").get(function () {
  if (this.reviewHistory.length < 2) return 0
  const firstReview = this.reviewHistory[0]
  const lastReview = this.reviewHistory[this.reviewHistory.length - 1]
  return lastReview.timestamp.getTime() - firstReview.timestamp.getTime()
})

// 实例方法：添加候选项
MatchingRecordSchema.methods.addCandidate = function (candidateData) {
  // 检查是否已存在相同的候选项
  const exists = this.candidates.some(
    (candidate) =>
      candidate.productId.toString() === candidateData.productId.toString()
  )

  if (!exists) {
    candidateData.rank = this.candidates.length + 1
    this.candidates.push(candidateData)

    // 按得分排序
    this.candidates.sort((a, b) => b.score.total - a.score.total)

    // 重新设置排名
    this.candidates.forEach((candidate, index) => {
      candidate.rank = index + 1
    })
  }

  return this.save()
}

// 实例方法：确认匹配
MatchingRecordSchema.methods.confirmMatch = async function (
  productId,
  userId,
  note,
  matchType = "manual"
) {
  // 验证产品是否存在
  const Product = require("./Product")
  const product = await Product.findById(productId)
  if (!product) {
    throw new Error("商品不存在")
  }

  // 查找候选项，如果不存在则创建一个临时候选项
  let candidate = this.candidates.find(
    (c) => c.productId.toString() === productId.toString()
  )

  if (!candidate) {
    // 创建临时候选项，用于手动选择的商品
    candidate = {
      productId: productId,
      score: {
        name: 100, // 手动选择的给满分
        brand: 100,
        keywords: 100,
        package: 100,
        price: 100,
        total: 100,
      },
      confidence: "high",
      reasons: [
        {
          type: "manual_selection",
          description: "用户手动选择",
          weight: 1.0,
        },
      ],
      rank: 1,
    }
    // 将此候选项添加到列表前面
    this.candidates.unshift(candidate)
  }

  this.selectedMatch = {
    productId,
    confidence: candidate.score.total,
    score: candidate.score.total,
    confirmedBy: userId,
    confirmedAt: new Date(),
    note,
    matchType,
  }

  this.status = "confirmed"

  // 添加审核历史
  this.addReviewHistory("confirm", userId, note, this.status, "confirmed")

  return this.save()
}

// 实例方法：拒绝匹配
MatchingRecordSchema.methods.rejectMatch = function (userId, note) {
  this.status = "rejected"
  this.addReviewHistory("reject", userId, note, this.status, "rejected")
  return this.save()
}

// 实例方法：清空匹配
MatchingRecordSchema.methods.clearMatch = function (userId, note) {
  const previousStatus = this.status

  // 清空匹配结果
  this.selectedMatch = undefined
  this.status = "pending"

  this.addReviewHistory(
    "clear",
    userId,
    note || "清空匹配商品",
    previousStatus,
    "pending",
    { reason: "cleared_match" }
  )

  return this.save()
}

// 实例方法：添加审核历史
MatchingRecordSchema.methods.addReviewHistory = function (
  action,
  userId,
  note,
  previousStatus,
  newStatus,
  details = {}
) {
  this.reviewHistory.push({
    action,
    performer: userId,
    timestamp: new Date(),
    note,
    previousStatus,
    newStatus,
    details,
  })

  return this
}

// 实例方法：添加异常
MatchingRecordSchema.methods.addException = function (
  type,
  message,
  severity = "medium"
) {
  this.exceptions.push({
    type,
    message,
    severity,
    createdAt: new Date(),
  })

  // 如果是高严重性异常，设置高优先级
  if (severity === "high") {
    this.priority = "high"
  }

  return this.save()
}

// 实例方法：解决异常
MatchingRecordSchema.methods.resolveException = function (
  exceptionIndex,
  userId
) {
  if (this.exceptions[exceptionIndex]) {
    this.exceptions[exceptionIndex].resolvedAt = new Date()
    this.exceptions[exceptionIndex].resolvedBy = userId
  }

  return this.save()
}

// 实例方法：记录用户行为
MatchingRecordSchema.methods.recordUserBehavior = function (
  userId,
  action,
  context = {}
) {
  if (!this.learningData) {
    this.learningData = { userPatterns: [] }
  }

  this.learningData.userPatterns.push({
    userId,
    action,
    timestamp: new Date(),
    context,
  })

  return this.save()
}

// 静态方法：获取待审核记录（包括异常记录）
MatchingRecordSchema.statics.getPendingReviews = function (
  filters = {},
  limit = 50,
  sortBy = "priority",
  page = 1
) {
  const query = {
    status: { $in: ["pending", "exception"] },
    ...filters,
  }

  let sortCondition = {}
  switch (sortBy) {
    case "score":
      // 按匹配分数降序排序（最高分在前）
      sortCondition = {
        "candidates.0.score.total": -1,
        priority: -1,
        createdAt: 1,
      }
      break
    case "priority":
      // 按优先级降序排序（高优先级在前）
      sortCondition = { priority: -1, createdAt: 1 }
      break
    case "confidence":
      // 按置信度降序排序
      sortCondition = {
        "candidates.0.confidence": -1,
        priority: -1,
        createdAt: 1,
      }
      break
    case "name":
      // 按原始名称升序排序
      sortCondition = { "originalData.name": 1, createdAt: 1 }
      break
    default:
      sortCondition = { priority: -1, createdAt: 1 }
  }

  return this.find(query)
    .populate("taskId", "filename status")
    .populate(
      "candidates.productId",
      "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
    )
    .populate(
      "selectedMatch.productId",
      "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
    )
    .populate("selectedMatch.confirmedBy", "name email")
    .sort(sortCondition)
    .limit(limit)
    .skip(Math.max(0, (parseInt(page) - 1) * parseInt(limit)))
}

// 静态方法：获取高风险记录
MatchingRecordSchema.statics.getHighRiskRecords = function (taskId) {
  return this.find({
    taskId,
    $or: [
      { "candidates.0.score.total": { $lt: 60 } },
      { exceptions: { $ne: [] } },
      { candidates: { $size: 0 } },
    ],
  })
    .populate(
      "candidates.productId",
      "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
    )
    .sort({ priority: -1, "candidates.0.score.total": 1 })
}

// 静态方法：统计匹配结果
MatchingRecordSchema.statics.getMatchingStatistics = function (taskId) {
  return this.aggregate([
    { $match: { taskId: new mongoose.Types.ObjectId(taskId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        avgScore: {
          $avg: { $arrayElemAt: ["$candidates.score.total", 0] },
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$count" },
        statusCounts: {
          $push: {
            status: "$_id",
            count: "$count",
            avgScore: "$avgScore",
          },
        },
      },
    },
  ])
}

// 静态方法：获取用户审核统计
MatchingRecordSchema.statics.getUserReviewStats = function (
  userId,
  dateRange = {}
) {
  const matchCondition = {
    "reviewHistory.performer": new mongoose.Types.ObjectId(userId),
  }

  if (dateRange.start || dateRange.end) {
    matchCondition["reviewHistory.timestamp"] = {}
    if (dateRange.start)
      matchCondition["reviewHistory.timestamp"].$gte = new Date(dateRange.start)
    if (dateRange.end)
      matchCondition["reviewHistory.timestamp"].$lte = new Date(dateRange.end)
  }

  return this.aggregate([
    { $match: matchCondition },
    { $unwind: "$reviewHistory" },
    {
      $match: {
        "reviewHistory.performer": new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $group: {
        _id: "$reviewHistory.action",
        count: { $sum: 1 },
        avgProcessingTime: { $avg: "$processingTime.review" },
      },
    },
  ])
}

const MatchingRecord = mongoose.model("MatchingRecord", MatchingRecordSchema)

module.exports = MatchingRecord
