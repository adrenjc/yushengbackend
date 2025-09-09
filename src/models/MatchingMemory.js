/**
 * 匹配记忆数据模型 - 学习用户匹配偏好，避免重复错误
 */
const mongoose = require("mongoose")

const MatchingMemorySchema = new mongoose.Schema(
  {
    // 原始批发名（标准化后）
    normalizedWholesaleName: {
      type: String,
      required: [true, "标准化批发名不能为空"],
      index: true,
      trim: true,
    },

    // 原始批发名（未标准化）
    originalWholesaleName: {
      type: String,
      required: [true, "原始批发名不能为空"],
      trim: true,
    },

    // 确认匹配的商品ID
    confirmedProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "确认的商品ID不能为空"],
      index: true,
    },

    // 模板ID（用于区分不同模板的记忆）
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductTemplate",
      required: false, // 暂时设为可选，兼容旧数据
      index: true,
    },

    // 匹配置信度
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },

    // 匹配来源
    source: {
      type: String,
      enum: ["auto", "manual", "expert", "learned"],
      default: "auto", // 改为auto，因为大部分是自动学习产生的
    },

    // 确认次数（相同匹配被确认的次数）
    confirmCount: {
      type: Number,
      default: 1,
      min: 1,
    },

    // 最后确认时间
    lastConfirmedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    // 确认用户
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 匹配权重（基于历史表现）
    weight: {
      type: Number,
      default: 1.0,
      min: 0.1,
      max: 10.0,
    },

    // 是否为用户偏好模式
    isUserPreference: {
      type: Boolean,
      default: false,
    },

    // 相关的匹配记录ID（用于追踪来源）
    relatedRecords: [
      {
        recordId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MatchingRecord",
        },
        taskId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MatchingTask",
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // 匹配特征（用于相似度计算）
    features: {
      extractedBrand: String,
      extractedSpecs: [String],
      priceRange: {
        min: Number,
        max: Number,
      },
      keywords: [String],
    },

    // 状态
    status: {
      type: String,
      enum: ["active", "deprecated", "conflicted"],
      default: "active",
      index: true,
    },

    // 元数据
    metadata: {
      // 创建来源
      sourceTask: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MatchingTask",
      },

      // 使用统计
      usageStats: {
        totalUsed: { type: Number, default: 0 },
        successRate: { type: Number, default: 100 },
        lastUsedAt: Date,
      },

      // 是否需要进一步确认（用于自动学习的记忆）
      requiresConfirmation: { type: Boolean, default: false },

      // 冲突信息
      conflicts: [
        {
          conflictingProductId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
          },
          conflictReason: String,
          reportedAt: Date,
          reportedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        },
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// 复合索引
MatchingMemorySchema.index(
  { normalizedWholesaleName: 1, confirmedProductId: 1 },
  { unique: true }
)
MatchingMemorySchema.index({ normalizedWholesaleName: "text" })
MatchingMemorySchema.index({
  status: 1,
  weight: -1,
  confirmCount: -1,
  lastConfirmedAt: -1,
})

// 虚拟字段：可信度得分
MatchingMemorySchema.virtual("trustScore").get(function () {
  const baseScore = this.confidence || 0
  const countBonus = Math.min(this.confirmCount * 5, 25) // 最多加25分
  const timeDecay = this.getTimeDecay()
  const weightBonus = (this.weight - 1) * 10

  return Math.min(100, baseScore + countBonus - timeDecay + weightBonus)
})

// 虚拟字段：是否为高可信记忆
MatchingMemorySchema.virtual("isHighTrust").get(function () {
  return this.trustScore >= 85 && this.confirmCount >= 2
})

// 实例方法：计算时间衰减
MatchingMemorySchema.methods.getTimeDecay = function () {
  const daysSinceLastConfirm = Math.floor(
    (Date.now() - this.lastConfirmedAt.getTime()) / (1000 * 60 * 60 * 24)
  )

  // 超过30天开始衰减，最多衰减20分
  if (daysSinceLastConfirm <= 30) return 0
  return Math.min(20, Math.floor((daysSinceLastConfirm - 30) / 10))
}

// 实例方法：增加确认次数
MatchingMemorySchema.methods.addConfirmation = function (
  userId,
  recordId,
  taskId
) {
  this.confirmCount += 1
  this.lastConfirmedAt = new Date()
  this.confirmedBy = userId

  // 添加相关记录
  this.relatedRecords.push({
    recordId,
    taskId,
    timestamp: new Date(),
  })

  // 更新使用统计
  this.metadata.usageStats.totalUsed += 1
  this.metadata.usageStats.lastUsedAt = new Date()

  // 提升权重（高频使用的记忆权重更高）
  if (this.confirmCount >= 3) {
    this.weight = Math.min(10.0, this.weight + 0.1)
    this.isUserPreference = true
  }

  return this.save()
}

// 实例方法：报告冲突
MatchingMemorySchema.methods.reportConflict = function (
  conflictingProductId,
  reason,
  userId
) {
  this.metadata.conflicts.push({
    conflictingProductId,
    conflictReason: reason,
    reportedAt: new Date(),
    reportedBy: userId,
  })

  // 如果冲突较多，降低权重
  if (this.metadata.conflicts.length >= 2) {
    this.weight = Math.max(0.1, this.weight - 0.3)
    if (this.metadata.conflicts.length >= 3) {
      this.status = "conflicted"
    }
  }

  return this.save()
}

// 静态方法：查找匹配记忆（改进版本）
MatchingMemorySchema.statics.findMatching = async function (
  normalizedName,
  options = {}
) {
  const {
    limit = 5,
    minConfidence = 60,
    includeDeprecated = false,
    templateId,
  } = options

  console.log(`🔍 记忆库查询: ${normalizedName}, 模板: ${templateId}`)

  // 基础查询条件
  const baseQuery = {}
  if (templateId) {
    baseQuery.templateId = templateId
  }

  // 构建多种查询条件，从严格到宽松
  const queries = []

  // 1. 精确匹配（最高优先级）
  queries.push({
    ...baseQuery,
    normalizedWholesaleName: normalizedName,
    confidence: { $gte: minConfidence },
  })

  // 2. 互相包含匹配
  queries.push({
    ...baseQuery,
    $or: [
      { normalizedWholesaleName: { $regex: normalizedName, $options: "i" } },
      {
        normalizedWholesaleName: {
          $regex: `.*${normalizedName}.*`,
          $options: "i",
        },
      },
    ],
    confidence: { $gte: minConfidence },
  })

  // 3. 宽松匹配（对于高确认次数的记忆，降低置信度要求）
  if (minConfidence > 40) {
    queries.push({
      ...baseQuery,
      $or: [
        { normalizedWholesaleName: { $regex: normalizedName, $options: "i" } },
        {
          normalizedWholesaleName: {
            $regex: `.*${normalizedName}.*`,
            $options: "i",
          },
        },
      ],
      confirmCount: { $gte: 3 }, // 高确认次数
      confidence: { $gte: 40 }, // 降低置信度要求
    })
  }

  // 状态过滤
  if (!includeDeprecated) {
    queries.forEach((query) => {
      query.status = { $in: ["active"] }
    })
  }

  let results = []

  // 按优先级执行查询
  for (const query of queries) {
    console.log(`🔍 执行查询:`, query)

    const matches = await this.find(query)
      .populate(
        "confirmedProductId",
        "name brand company productCode boxCode pricing"
      )
      .populate("confirmedBy", "name email")
      .sort({ confirmCount: -1, weight: -1, lastConfirmedAt: -1 }) // 优先高确认次数
      .limit(limit)
      .lean()

    console.log(`🔍 查询结果: ${matches.length} 条记录`)

    if (matches.length > 0) {
      results = matches
      break // 找到结果就停止后续查询
    }
  }

  console.log(
    `🧠 最终记忆匹配结果: ${results.length} 条`,
    results.map((r) => ({
      标准化名称: r.normalizedWholesaleName,
      确认次数: r.confirmCount,
      商品名称: r.confirmedProductId?.name,
    }))
  )

  return results
}

// 静态方法：学习新的匹配
MatchingMemorySchema.statics.learnFromMatch = async function (
  originalName,
  productId,
  confidence,
  userId,
  recordId,
  taskId,
  templateId,
  options = {}
) {
  const { normalizeText } = require("../utils/matching-algorithm")
  const normalizedName = normalizeText(originalName)

  // 检查是否已存在相同的记忆（在同一模板下）
  let memory = await this.findOne({
    normalizedWholesaleName: normalizedName,
    confirmedProductId: productId,
    templateId: templateId,
  })

  if (memory) {
    // 检查是否已经在同一任务中学习过
    const alreadyLearnedInTask = memory.relatedRecords.some(
      (record) => record.taskId.toString() === taskId.toString()
    )

    if (alreadyLearnedInTask) {
      // 同一任务内的重复，只添加记录但不增加确认次数
      memory.relatedRecords.push({
        recordId,
        taskId,
        timestamp: new Date(),
      })
      memory.metadata.usageStats.totalUsed += 1
      memory.metadata.usageStats.lastUsedAt = new Date()
      return memory.save()
    } else {
      // 不同任务的确认，正常增加确认次数
      return memory.addConfirmation(userId, recordId, taskId)
    }
  } else {
    // 从选项中提取参数
    const {
      source = "manual",
      initialWeight = 1.0,
      requiresConfirmation = false,
    } = options

    // 创建新的记忆
    memory = new this({
      normalizedWholesaleName: normalizedName,
      originalWholesaleName: originalName,
      confirmedProductId: productId,
      templateId: templateId,
      confidence,
      confirmedBy: userId,
      source: source,
      weight: initialWeight,
      relatedRecords: [
        {
          recordId,
          taskId,
          timestamp: new Date(),
        },
      ],
      metadata: {
        sourceTask: taskId,
        usageStats: {
          totalUsed: 1,
          lastUsedAt: new Date(),
        },
        requiresConfirmation: requiresConfirmation,
      },
    })

    return memory.save()
  }
}

// 静态方法：处理拒绝的匹配
MatchingMemorySchema.statics.handleRejectedMatch = async function (
  originalName,
  rejectedProductId,
  userId,
  recordId,
  taskId
) {
  const normalizedName = this.normalizeWholesaleName(originalName)

  // 查找被拒绝的匹配记忆
  const rejectedMemory = await this.findOne({
    normalizedWholesaleName: normalizedName,
    confirmedProductId: rejectedProductId,
    status: "active",
  })

  if (rejectedMemory) {
    // 降低权重和置信度
    rejectedMemory.weight = Math.max(0.1, rejectedMemory.weight * 0.7)
    rejectedMemory.confidence = Math.max(30, rejectedMemory.confidence * 0.8)

    // 增加争议标记
    if (!rejectedMemory.metadata.conflicts) {
      rejectedMemory.metadata.conflicts = []
    }

    rejectedMemory.metadata.conflicts.push({
      type: "user_rejection",
      userId,
      recordId,
      taskId,
      timestamp: new Date(),
      reason: "用户拒绝匹配",
    })

    // 如果拒绝次数过多，标记为争议状态
    const rejectionCount = rejectedMemory.metadata.conflicts.filter(
      (c) => c.type === "user_rejection"
    ).length

    if (rejectionCount >= 3) {
      rejectedMemory.status = "disputed"
      rejectedMemory.metadata.disputeReason = "多次被用户拒绝"
    }

    rejectedMemory.metadata.usageStats.lastRejectedAt = new Date()
    rejectedMemory.metadata.usageStats.rejectionCount = rejectionCount

    await rejectedMemory.save()
    return rejectedMemory
  }

  return null
}

// 静态方法：处理匹配更改
MatchingMemorySchema.statics.handleMatchChange = async function (
  originalName,
  oldProductId,
  newProductId,
  confidence,
  userId,
  recordId,
  taskId,
  templateId
) {
  // 1. 处理旧匹配的拒绝
  if (oldProductId) {
    await this.handleRejectedMatch(
      originalName,
      oldProductId,
      userId,
      recordId,
      taskId
    )
  }

  // 2. 学习新的正确匹配
  await this.learnFromMatch(
    originalName,
    newProductId,
    confidence,
    userId,
    recordId,
    taskId,
    templateId,
    {
      source: "manual",
      initialWeight: 1.5, // 用户手动选择的权重稍高
      requiresConfirmation: false,
    }
  )

  return true
}

// 静态方法：清理过时记忆
MatchingMemorySchema.statics.cleanupOldMemories = async function () {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  // 将超过6个月未使用的记忆标记为废弃
  await this.updateMany(
    {
      lastConfirmedAt: { $lt: sixMonthsAgo },
      confirmCount: { $lt: 2 },
      status: "active",
    },
    {
      status: "deprecated",
    }
  )

  return true
}

// 静态方法：获取用户偏好统计
MatchingMemorySchema.statics.getUserPreferenceStats = function (userId) {
  return this.aggregate([
    {
      $match: {
        confirmedBy: new mongoose.Types.ObjectId(userId),
        status: "active",
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "confirmedProductId",
        foreignField: "_id",
        as: "product",
      },
    },
    {
      $unwind: "$product",
    },
    {
      $group: {
        _id: {
          brand: "$product.brand",
          priceCategory: "$product.pricing.priceCategory",
        },
        count: { $sum: 1 },
        avgConfidence: { $avg: "$confidence" },
        totalWeight: { $sum: "$weight" },
      },
    },
    {
      $sort: { count: -1, totalWeight: -1 },
    },
    {
      $limit: 10,
    },
  ])
}

const MatchingMemory = mongoose.model("MatchingMemory", MatchingMemorySchema)

module.exports = MatchingMemory
