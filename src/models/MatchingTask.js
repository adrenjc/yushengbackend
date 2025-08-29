/**
 * 匹配任务数据模型
 */
const mongoose = require("mongoose")

const MatchingTaskSchema = new mongoose.Schema(
  {
    // 模板关联
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductTemplate",
      required: true,
      index: true,
    },
    templateName: {
      type: String,
      required: true,
      trim: true,
    },

    // 文件信息
    filename: {
      type: String,
      required: [true, "文件名不能为空"],
      trim: true,
    },
    originalFilename: {
      type: String,
      required: [true, "原始文件名不能为空"],
      trim: true,
    },
    fileSize: {
      type: Number,
      required: [true, "文件大小不能为空"],
      min: [0, "文件大小不能为负数"],
    },
    filePath: {
      type: String,
      required: [true, "文件路径不能为空"],
    },
    fileHash: {
      type: String,
      index: true, // 用于检测重复文件
    },

    // 任务状态
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "review",
        "completed",
        "failed",
        "cancelled",
      ],
      default: "pending",
      required: true,
      index: true,
    },

    // 匹配配置
    config: {
      // 匹配阈值配置
      threshold: {
        type: Number,
        default: 65,
        min: [0, "匹配阈值不能小于0"],
        max: [100, "匹配阈值不能大于100"],
      },
      autoConfirmThreshold: {
        type: Number,
        default: 90,
        min: [0, "自动确认阈值不能小于0"],
        max: [100, "自动确认阈值不能大于100"],
      },

      // 匹配策略
      strategies: {
        brandPriority: { type: Boolean, default: true },
        keywordMatching: { type: Boolean, default: true },
        packageTypeRecognition: { type: Boolean, default: true },
        priceValidation: { type: Boolean, default: true },
        fuzzyMatching: { type: Boolean, default: true },
      },

      // 权重配置
      weights: {
        name: { type: Number, default: 0.35 },
        brand: { type: Number, default: 0.25 },
        keywords: { type: Number, default: 0.2 },
        package: { type: Number, default: 0.1 },
        price: { type: Number, default: 0.1 },
      },
    },

    // 进度信息
    progress: {
      totalItems: { type: Number, default: 0 },
      processedItems: { type: Number, default: 0 },
      confirmedItems: { type: Number, default: 0 },
      pendingItems: { type: Number, default: 0 },
      rejectedItems: { type: Number, default: 0 },
      exceptionItems: { type: Number, default: 0 },
    },

    // 统计信息
    statistics: {
      // 置信度分布
      confidenceDistribution: {
        high: { type: Number, default: 0 }, // >90%
        medium: { type: Number, default: 0 }, // 60-90%
        low: { type: Number, default: 0 }, // <60%
      },

      // 匹配质量
      averageConfidence: { type: Number, default: 0 },
      matchRate: { type: Number, default: 0 },

      // 处理时间
      processingTime: {
        started: Date,
        parsing: Number, // 文件解析耗时(ms)
        matching: Number, // 匹配耗时(ms)
        total: Number, // 总耗时(ms)
      },
    },

    // 任务执行信息
    execution: {
      startedAt: Date,
      completedAt: Date,
      error: String,
      retryCount: { type: Number, default: 0 },
      lastRetryAt: Date,
    },

    // 创建和分配信息
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "创建者不能为空"],
      index: true,
    },
    assignedTo: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        role: {
          type: String,
          enum: ["reviewer", "expert", "supervisor"],
        },
        assignedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // 审核流程
    reviewProcess: {
      currentStage: {
        type: String,
        enum: ["auto", "manual", "expert", "final"],
        default: "auto",
      },
      stages: [
        {
          stage: {
            type: String,
            enum: ["auto", "manual", "expert", "final"],
          },
          status: {
            type: String,
            enum: ["pending", "in_progress", "completed", "skipped"],
          },
          startedAt: Date,
          completedAt: Date,
          reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          note: String,
        },
      ],
    },

    // 通知设置
    notifications: {
      onComplete: { type: Boolean, default: true },
      onError: { type: Boolean, default: true },
      recipients: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
    },

    // 元数据
    metadata: {
      source: {
        type: String,
        enum: ["web_upload", "api", "batch_import"],
        default: "web_upload",
      },
      tags: [String],
      priority: {
        type: String,
        enum: ["low", "normal", "high", "urgent"],
        default: "normal",
      },
      description: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// 索引
MatchingTaskSchema.index({ status: 1, createdAt: -1 })
MatchingTaskSchema.index({ createdBy: 1, status: 1 })
MatchingTaskSchema.index({ "assignedTo.user": 1, status: 1 })
MatchingTaskSchema.index({ "metadata.priority": 1, createdAt: -1 })

// 虚拟字段：完成百分比
MatchingTaskSchema.virtual("completionPercentage").get(function () {
  if (this.progress.totalItems === 0) return 0
  return Math.round(
    (this.progress.processedItems / this.progress.totalItems) * 100
  )
})

// 虚拟字段：是否已完成
MatchingTaskSchema.virtual("isCompleted").get(function () {
  return this.status === "completed"
})

// 虚拟字段：是否正在处理
MatchingTaskSchema.virtual("isProcessing").get(function () {
  return ["processing", "review"].includes(this.status)
})

// 虚拟字段：处理总时长
MatchingTaskSchema.virtual("totalDuration").get(function () {
  if (!this.execution.startedAt) return 0
  const endTime = this.execution.completedAt || new Date()
  return endTime.getTime() - this.execution.startedAt.getTime()
})

// 实例方法：更新进度
MatchingTaskSchema.methods.updateProgress = function (progressData) {
  Object.assign(this.progress, progressData)

  // 自动计算待处理项目数
  this.progress.pendingItems =
    this.progress.totalItems -
    this.progress.confirmedItems -
    this.progress.rejectedItems -
    this.progress.exceptionItems

  return this.save()
}

// 实例方法：更新统计信息
MatchingTaskSchema.methods.updateStatistics = function (stats) {
  Object.assign(this.statistics, stats)

  // 计算匹配率
  if (this.progress.totalItems > 0) {
    this.statistics.matchRate = Math.round(
      (this.progress.confirmedItems / this.progress.totalItems) * 100
    )
  }

  return this.save()
}

// 实例方法：开始任务
MatchingTaskSchema.methods.start = function () {
  this.status = "processing"
  this.execution.startedAt = new Date()
  this.statistics.processingTime.started = new Date()
  return this.save()
}

// 实例方法：完成任务
MatchingTaskSchema.methods.complete = function () {
  this.status = "completed"
  this.execution.completedAt = new Date()

  // 计算总处理时间
  if (this.execution.startedAt) {
    this.statistics.processingTime.total =
      this.execution.completedAt.getTime() - this.execution.startedAt.getTime()
  }

  return this.save()
}

// 实例方法：失败任务
MatchingTaskSchema.methods.fail = function (error) {
  this.status = "failed"
  this.execution.error = error
  this.execution.completedAt = new Date()
  return this.save()
}

// 实例方法：重试任务
MatchingTaskSchema.methods.retry = function () {
  this.execution.retryCount += 1
  this.execution.lastRetryAt = new Date()
  this.execution.error = null
  this.status = "pending"
  return this.save()
}

// 实例方法：分配审核员
MatchingTaskSchema.methods.assignReviewer = function (
  userId,
  role = "reviewer"
) {
  // 检查是否已分配
  const existingAssignment = this.assignedTo.find(
    (assignment) => assignment.user.toString() === userId.toString()
  )

  if (!existingAssignment) {
    this.assignedTo.push({
      user: userId,
      role,
      assignedAt: new Date(),
    })
  }

  return this.save()
}

// 实例方法：推进审核阶段
MatchingTaskSchema.methods.advanceReviewStage = function (
  nextStage,
  reviewerId,
  note
) {
  // 完成当前阶段
  if (this.reviewProcess.stages.length > 0) {
    const currentStage =
      this.reviewProcess.stages[this.reviewProcess.stages.length - 1]
    if (currentStage.status === "in_progress") {
      currentStage.status = "completed"
      currentStage.completedAt = new Date()
      currentStage.reviewer = reviewerId
      currentStage.note = note
    }
  }

  // 开始新阶段
  if (nextStage) {
    this.reviewProcess.currentStage = nextStage
    this.reviewProcess.stages.push({
      stage: nextStage,
      status: "in_progress",
      startedAt: new Date(),
      reviewer: reviewerId,
    })
  }

  return this.save()
}

// 静态方法：获取用户任务
MatchingTaskSchema.statics.getUserTasks = function (
  userId,
  status,
  limit = 20
) {
  const query = {
    $or: [{ createdBy: userId }, { "assignedTo.user": userId }],
  }

  if (status) {
    query.status = status
  }

  return this.find(query)
    .populate("createdBy", "name email")
    .populate("assignedTo.user", "name email")
    .sort({ createdAt: -1 })
    .limit(limit)
}

// 静态方法：获取待审核任务
MatchingTaskSchema.statics.getPendingReviewTasks = function (
  userId,
  limit = 50
) {
  return this.find({
    status: "review",
    "assignedTo.user": userId,
  })
    .populate("createdBy", "name email")
    .sort({ "metadata.priority": -1, createdAt: 1 }) // 高优先级优先，早创建的优先
    .limit(limit)
}

// 静态方法：获取统计数据
MatchingTaskSchema.statics.getStatistics = function (dateRange = {}) {
  const { startDate, endDate } = dateRange
  const matchCondition = {}

  if (startDate || endDate) {
    matchCondition.createdAt = {}
    if (startDate) matchCondition.createdAt.$gte = new Date(startDate)
    if (endDate) matchCondition.createdAt.$lte = new Date(endDate)
  }

  return this.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        failedTasks: {
          $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
        },
        totalItems: { $sum: "$progress.totalItems" },
        totalProcessed: { $sum: "$progress.processedItems" },
        totalConfirmed: { $sum: "$progress.confirmedItems" },
        avgProcessingTime: { $avg: "$statistics.processingTime.total" },
        avgConfidence: { $avg: "$statistics.averageConfidence" },
      },
    },
  ])
}

const MatchingTask = mongoose.model("MatchingTask", MatchingTaskSchema)

module.exports = MatchingTask
