/**
 * 匹配记忆管理控制器
 */
const MatchingMemory = require("../models/MatchingMemory")
const { logger, logOperation } = require("../utils/logger")
const {
  asyncHandler,
  BusinessError,
  NotFoundError,
} = require("../middleware/error.middleware")
const mongoose = require("mongoose")

/**
 * 获取记忆列表
 */
const getMemories = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = "",
    status = "all",
    source = "all",
    templateId = "",
    sortBy = "trustScore_desc",
  } = req.query

  // 构建查询条件
  const query = {}

  if (status !== "all") {
    query.status = status
  }

  if (source !== "all") {
    query.source = source
  }

  if (templateId) {
    query.templateId = templateId
  }

  // 搜索逻辑 - 支持商品字段搜索
  if (search) {
    console.log(`🔍 执行搜索，关键词: "${search}"`)

    // 构建基础的记忆搜索条件
    const memorySearchCondition = {
      $or: [
        { originalWholesaleName: { $regex: search, $options: "i" } },
        { normalizedWholesaleName: { $regex: search, $options: "i" } },
      ],
    }

    // 查找匹配的商品ID
    const Product = require("../models/Product")
    const matchingProducts = await Product.find(
      {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { brand: { $regex: search, $options: "i" } },
          { productCode: { $regex: search, $options: "i" } },
          { boxCode: { $regex: search, $options: "i" } },
        ],
      },
      "_id"
    ).lean()

    const matchingProductIds = matchingProducts.map((p) => p._id)
    console.log(`🔍 找到 ${matchingProductIds.length} 个匹配的商品`)

    // 组合搜索条件
    if (matchingProductIds.length > 0) {
      query.$or = [
        memorySearchCondition,
        { confirmedProductId: { $in: matchingProductIds } },
      ]
    } else {
      // 如果没有匹配的商品，只搜索记忆字段
      Object.assign(query, memorySearchCondition)
    }
  }

  // 构建排序条件
  let sortCondition = {}
  switch (sortBy) {
    case "trustScore_desc":
      sortCondition = { weight: -1, confirmCount: -1, lastConfirmedAt: -1 }
      break
    case "trustScore_asc":
      sortCondition = { weight: 1, confirmCount: 1, lastConfirmedAt: 1 }
      break
    case "confirmCount_desc":
      sortCondition = { confirmCount: -1, weight: -1 }
      break
    case "lastUsed_desc":
      sortCondition = { "metadata.usageStats.lastUsedAt": -1 }
      break
    case "created_desc":
      sortCondition = { createdAt: -1 }
      break
    default:
      sortCondition = { weight: -1, confirmCount: -1 }
  }

  console.log(`🔍 最终查询条件:`, JSON.stringify(query, null, 2))

  const [memories, total, statistics] = await Promise.all([
    MatchingMemory.find(query)
      .populate(
        "confirmedProductId",
        "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
      )
      .populate("confirmedBy", "name email")
      .populate(
        "metadata.learningSource.sourceTask.taskId",
        "originalFilename templateName createdAt status"
      )
      .populate(
        "relatedRecords.taskId",
        "originalFilename templateName createdAt status"
      )
      .sort(sortCondition)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean(),
    MatchingMemory.countDocuments(query),
    getStatistics(),
  ])

  // 添加虚拟字段计算
  const enrichedMemories = memories.map((memory) => ({
    ...memory,
    trustScore: calculateTrustScore(memory),
    isHighTrust: calculateTrustScore(memory) >= 85 && memory.confirmCount >= 2,
  }))

  res.json({
    success: true,
    data: {
      memories: enrichedMemories,
      statistics,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  })
})

/**
 * 获取记忆统计信息
 */
const getMemoryStatistics = asyncHandler(async (req, res) => {
  const statistics = await getStatistics()

  res.json({
    success: true,
    data: statistics,
  })
})

/**
 * 获取单个记忆详情
 */
const getMemoryById = asyncHandler(async (req, res) => {
  const { id } = req.params

  const memory = await MatchingMemory.findById(id)
    .populate(
      "confirmedProductId",
      "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
    )
    .populate("confirmedBy", "name email")
    .populate(
      "metadata.learningSource.sourceTask.taskId",
      "originalFilename templateName createdAt status"
    )
    .populate("relatedRecords.recordId", "originalData status")
    .populate(
      "relatedRecords.taskId",
      "originalFilename templateName createdAt status"
    )

  if (!memory) {
    throw new NotFoundError("匹配记忆")
  }

  // 添加虚拟字段
  const enrichedMemory = {
    ...memory.toObject(),
    trustScore: calculateTrustScore(memory),
    isHighTrust: calculateTrustScore(memory) >= 85 && memory.confirmCount >= 2,
  }

  res.json({
    success: true,
    data: { memory: enrichedMemory },
  })
})

/**
 * 更新记忆
 */
const updateMemory = asyncHandler(async (req, res) => {
  const { id } = req.params
  const {
    status,
    weight,
    confidence,
    confirmedProductId,
    isUserPreference,
    note,
  } = req.body

  const memory = await MatchingMemory.findById(id)
  if (!memory) {
    throw new NotFoundError("匹配记忆")
  }

  // 如果要更新确认商品，验证商品是否存在
  let productInfo = null
  if (confirmedProductId) {
    const Product = require("../models/Product")
    productInfo = await Product.findById(confirmedProductId)
    if (!productInfo) {
      throw new BusinessError("指定的商品不存在", 400)
    }
  }

  // 保存更新前的值用于日志
  const changes = {}

  // 更新字段
  if (status) {
    changes.status = { from: memory.status, to: status }
    memory.status = status
  }

  if (weight !== undefined) {
    changes.weight = { from: memory.weight, to: weight }
    memory.weight = Math.max(0.1, Math.min(10.0, weight))
  }

  if (confidence !== undefined) {
    changes.confidence = { from: memory.confidence, to: confidence }
    memory.confidence = Math.max(0, Math.min(100, confidence))
  }

  if (confirmedProductId) {
    changes.confirmedProductId = {
      from: memory.confirmedProductId,
      to: confirmedProductId,
    }
    memory.confirmedProductId = confirmedProductId
  }

  if (isUserPreference !== undefined) {
    changes.isUserPreference = {
      from: memory.isUserPreference,
      to: isUserPreference,
    }
    memory.isUserPreference = isUserPreference
  }

  await memory.save()

  // 重新查询包含关联数据的记忆
  const updatedMemory = await MatchingMemory.findById(id).populate(
    "confirmedProductId",
    "name brand company productCode boxCode"
  )

  logOperation("更新匹配记忆", req.user, {
    memoryId: memory._id,
    originalName: memory.originalWholesaleName,
    changes,
    note,
    productChanged: !!confirmedProductId,
    newProductName: productInfo?.name,
  })

  res.json({
    success: true,
    message: "记忆更新成功",
    data: { memory: updatedMemory },
  })
})

/**
 * 删除记忆
 */
const deleteMemory = asyncHandler(async (req, res) => {
  const { id } = req.params

  const memory = await MatchingMemory.findById(id)
  if (!memory) {
    throw new NotFoundError("匹配记忆")
  }

  await MatchingMemory.findByIdAndDelete(id)

  logOperation("删除匹配记忆", req.user, {
    memoryId: memory._id,
    originalName: memory.originalWholesaleName,
    confirmCount: memory.confirmCount,
  })

  res.json({
    success: true,
    message: "记忆删除成功",
  })
})

/**
 * 清理废弃记忆
 */
const cleanupMemories = asyncHandler(async (req, res) => {
  const { force = false } = req.body

  let deleteConditions = {
    status: "deprecated",
  }

  if (force) {
    // 强制清理：包括低可信度、长期未使用的记忆
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    deleteConditions = {
      $or: [
        { status: "deprecated" },
        {
          status: "conflicted",
          "metadata.conflicts.2": { $exists: true }, // 有3个或以上冲突
        },
        {
          confirmCount: 1,
          lastConfirmedAt: { $lt: sixMonthsAgo },
          weight: { $lt: 1.0 },
        },
      ],
    }
  }

  const result = await MatchingMemory.deleteMany(deleteConditions)

  logOperation("清理匹配记忆", req.user, {
    cleanedCount: result.deletedCount,
    force,
  })

  res.json({
    success: true,
    message: `清理完成，删除了 ${result.deletedCount} 条记忆`,
    data: {
      cleanedCount: result.deletedCount,
    },
  })
})

/**
 * 计算记忆可信度分数
 */
function calculateTrustScore(memory) {
  const baseScore = memory.confidence || 0
  const countBonus = Math.min(memory.confirmCount * 5, 25) // 最多加25分
  const timeDecay = getTimeDecay(memory.lastConfirmedAt)
  const weightBonus = (memory.weight - 1) * 10

  return Math.min(
    100,
    Math.round(baseScore + countBonus - timeDecay + weightBonus)
  )
}

/**
 * 计算时间衰减
 */
function getTimeDecay(lastConfirmedAt) {
  const daysSinceLastConfirm = Math.floor(
    (Date.now() - new Date(lastConfirmedAt).getTime()) / (1000 * 60 * 60 * 24)
  )

  // 超过30天开始衰减，最多衰减20分
  if (daysSinceLastConfirm <= 30) return 0
  return Math.min(20, Math.floor((daysSinceLastConfirm - 30) / 10))
}

/**
 * 获取统计信息
 */
async function getStatistics() {
  const [total, active, deprecated, conflicted, highTrustMemories, usageStats] =
    await Promise.all([
      MatchingMemory.countDocuments(),
      MatchingMemory.countDocuments({ status: "active" }),
      MatchingMemory.countDocuments({ status: "deprecated" }),
      MatchingMemory.countDocuments({ status: "conflicted" }),
      MatchingMemory.find({ status: "active" }).lean(),
      MatchingMemory.aggregate([
        {
          $group: {
            _id: null,
            totalUsage: { $sum: "$metadata.usageStats.totalUsed" },
            avgConfidence: { $avg: "$confidence" },
            avgWeight: { $avg: "$weight" },
          },
        },
      ]),
    ])

  // 计算高可信度记忆数量
  const highTrust = highTrustMemories.filter((memory) => {
    const trustScore = calculateTrustScore(memory)
    return trustScore >= 85 && memory.confirmCount >= 2
  }).length

  // 计算平均可信度
  const avgTrustScore =
    highTrustMemories.length > 0
      ? Math.round(
          highTrustMemories.reduce(
            (sum, memory) => sum + calculateTrustScore(memory),
            0
          ) / highTrustMemories.length
        )
      : 0

  return {
    total,
    active,
    deprecated,
    conflicted,
    highTrust,
    averageTrustScore: avgTrustScore,
    totalUsage: usageStats[0]?.totalUsage || 0,
  }
}

// 清理重复记忆
const cleanupDuplicateMemories = asyncHandler(async (req, res) => {
  const { templateId } = req.body

  try {
    logger.info("开始清理重复记忆", {
      userId: req.user._id,
      templateId: templateId || "all",
    })

    const result = await MatchingMemory.cleanupDuplicateMemories(templateId)

    logOperation("清理重复记忆", req.user, {
      duplicatesFound: result.duplicatesFound,
      cleanedCount: result.cleanedCount,
      templateId: templateId || "all",
    })

    res.json({
      success: true,
      message: `清理完成，发现 ${result.duplicatesFound} 组重复数据，处理了 ${result.cleanedCount} 条重复记忆`,
      data: {
        duplicatesFound: result.duplicatesFound,
        cleanedCount: result.cleanedCount,
        templateId: templateId || "all",
      },
    })
  } catch (error) {
    logger.error("清理重复记忆失败", {
      userId: req.user._id,
      templateId: templateId || "all",
      error: error.message,
    })
    throw error
  }
})

// 清空所有记忆（危险操作，仅用于测试）
const clearAllMemories = asyncHandler(async (req, res) => {
  try {
    const result = await MatchingMemory.deleteMany({})

    logOperation("清空记忆库", req.user, {
      deletedCount: result.deletedCount,
    })

    res.json({
      success: true,
      message: `已清空 ${result.deletedCount} 条记忆记录`,
      data: {
        deletedCount: result.deletedCount,
      },
    })
  } catch (error) {
    logger.error("清空记忆库失败", {
      userId: req.user._id,
      error: error.message,
    })
    throw error
  }
})

module.exports = {
  getMemories,
  getMemoryById,
  updateMemory,
  deleteMemory,
  cleanupMemories,
  cleanupDuplicateMemories,
  getMemoryStatistics,
  clearAllMemories,
}
