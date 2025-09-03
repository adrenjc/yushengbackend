/**
 * 智能匹配系统控制器
 */
const MatchingTask = require("../models/MatchingTask")
const MatchingRecord = require("../models/MatchingRecord")
const Product = require("../models/Product")
const { logger, logOperation } = require("../utils/logger")
const {
  asyncHandler,
  BusinessError,
  NotFoundError,
} = require("../middleware/error.middleware")
const xlsx = require("xlsx")
const csv = require("csv-parser")
const fs = require("fs")
const path = require("path")
const mongoose = require("mongoose")

/**
 * 智能匹配算法实现
 */
class MatchingEngine {
  constructor() {
    // 默认权重配置
    this.defaultWeights = {
      name: 0.35, // 名称匹配权重
      brand: 0.25, // 品牌匹配权重
      keywords: 0.2, // 关键词匹配权重
      package: 0.1, // 包装规格权重
      price: 0.1, // 价格匹配权重
    }

    // 置信度阈值
    this.confidenceThresholds = {
      auto: 65, // 自动确认阈值（优化后）
      review: 40, // 需要审核阈值
      reject: 15, // 自动拒绝阈值
    }

    // 评分优化配置
    this.scoreBoosts = {
      exactNameMatch: 20, // 精确名称匹配加分
      exactBrandMatch: 15, // 精确品牌匹配加分
      containsAllKeywords: 10, // 包含所有关键词加分
    }
  }

  /**
   * 执行智能匹配
   * @param {Object} originalData 原始数据
   * @param {Array} products 商品库
   * @param {Object} config 匹配配置
   * @returns {Array} 匹配候选项
   */
  async match(originalData, products, config = {}) {
    const weights = { ...this.defaultWeights, ...config.weights }
    const candidates = []

    // 预处理原始名称
    const processedOriginalName = this.preprocessName(originalData.name)

    for (const product of products) {
      const score = await this.calculateMatchScore(
        originalData,
        product,
        weights,
        processedOriginalName
      )

      if (score.total >= this.confidenceThresholds.reject) {
        candidates.push({
          productId: product._id,
          score,
          confidence: this.getConfidenceLevel(score.total),
          reasons: this.generateMatchReasons(originalData, product, score),
          rank: 0, // 将在排序后设置
        })
      }
    }

    // 按总分排序
    candidates.sort((a, b) => b.score.total - a.score.total)

    // 设置排名
    candidates.forEach((candidate, index) => {
      candidate.rank = index + 1
    })

    return candidates.slice(0, 10) // 返回前10个候选项
  }

  /**
   * 计算匹配得分
   */
  async calculateMatchScore(
    originalData,
    product,
    weights,
    processedOriginalName
  ) {
    const scores = {
      name: 0,
      brand: 0,
      keywords: 0,
      package: 0,
      price: 0,
      total: 0,
    }

    // 1. 名称匹配得分
    scores.name = this.calculateNameScore(
      processedOriginalName,
      this.preprocessName(product.name)
    )

    // 2. 品牌匹配得分
    scores.brand = this.calculateBrandScore(
      originalData.brand || this.extractBrandFromName(originalData.name),
      product.brand
    )

    // 3. 关键词匹配得分
    scores.keywords = this.calculateKeywordScore(
      processedOriginalName,
      product.keywords || []
    )

    // 4. 包装规格匹配得分
    scores.package = this.calculatePackageScore(
      originalData.name,
      product.specifications?.packageType || "",
      product.specifications?.size || ""
    )

    // 5. 价格匹配得分
    scores.price = this.calculatePriceScore(
      originalData.price,
      product.companyPrice || product.specifications?.price,
      originalData.priceRange
    )

    // 计算加权总分
    let totalScore =
      scores.name * weights.name +
      scores.brand * weights.brand +
      scores.keywords * weights.keywords +
      scores.package * weights.package +
      scores.price * weights.price

    // 添加质量加分机制
    let bonusScore = 0

    // 精确名称匹配加分
    if (scores.name >= 95) {
      bonusScore += this.scoreBoosts.exactNameMatch
    }

    // 精确品牌匹配加分
    if (scores.brand >= 90) {
      bonusScore += this.scoreBoosts.exactBrandMatch
    }

    // 包含所有关键词加分
    if (scores.keywords >= 80) {
      bonusScore += this.scoreBoosts.containsAllKeywords
    }

    // 应用加分，但不超过100分
    scores.total = Math.min(100, Math.round(totalScore + bonusScore))

    return scores
  }

  /**
   * 预处理商品名称
   */
  preprocessName(name) {
    if (!name) return ""

    const processed = name
      .toLowerCase()
      .replace(/[（()）]/g, "") // 移除括号
      .replace(/\s+/g, "") // 移除空格
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, "") // 只保留中文、英文、数字

    return processed
  }

  /**
   * 计算名称相似度得分 (0-100)
   */
  calculateNameScore(name1, name2) {
    if (!name1 || !name2) return 0

    // Jaccard相似度
    const jaccardSimilarity = this.jaccardSimilarity(name1, name2)

    // 编辑距离相似度
    const editDistance = this.levenshteinDistance(name1, name2)
    const maxLen = Math.max(name1.length, name2.length)
    const editSimilarity = maxLen > 0 ? (maxLen - editDistance) / maxLen : 0

    // 最长公共子序列相似度
    const lcsSimilarity =
      this.longestCommonSubsequence(name1, name2) /
      Math.max(name1.length, name2.length)

    // 优化加权平均，提高相似度评分
    let finalScore =
      (jaccardSimilarity * 0.4 + editSimilarity * 0.4 + lcsSimilarity * 0.2) *
      100

    // 对高相似度给予额外加分
    if (finalScore >= 70) {
      finalScore += 10 // 高相似度额外加10分
    } else if (finalScore >= 50) {
      finalScore += 5 // 中等相似度额外加5分
    }

    return Math.round(Math.max(0, Math.min(100, finalScore)))
  }

  /**
   * 计算品牌匹配得分
   */
  calculateBrandScore(originalBrand, productBrand) {
    // 如果都没有品牌信息，给中等分数
    if (!originalBrand && !productBrand) return 50

    // 如果只有一个有品牌信息，给较低分数
    if (!originalBrand || !productBrand) return 30

    const brand1 = originalBrand.toLowerCase().trim()
    const brand2 = productBrand.toLowerCase().trim()

    // 完全匹配
    if (brand1 === brand2) return 100

    // 包含关系
    if (brand1.includes(brand2) || brand2.includes(brand1)) return 90

    // 相似度匹配
    const similarity = this.jaccardSimilarity(brand1, brand2)
    return Math.round(similarity * 100)
  }

  /**
   * 计算关键词匹配得分
   */
  calculateKeywordScore(originalName, keywords) {
    // 提取原始名称的关键词
    const originalWords = this.extractKeywords(originalName)

    // 如果都没有关键词，给中等分数
    if ((!keywords || keywords.length === 0) && originalWords.length === 0) {
      return 50
    }

    // 如果其中一个没有关键词，给较低分数
    if (!keywords || keywords.length === 0) return 30
    if (originalWords.length === 0) return 40

    let matchCount = 0

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase()
      for (const word of originalWords) {
        if (word.includes(keywordLower) || keywordLower.includes(word)) {
          matchCount++
          break
        }
      }
    }

    // 基础分数40 + 匹配奖励60
    const matchRatio = matchCount / Math.max(keywords.length, 1)
    const score = 40 + matchRatio * 60
    return Math.round(score)
  }

  /**
   * 计算包装规格匹配得分
   */
  calculatePackageScore(originalName, packageType, size) {
    if (!packageType && !size) return 50 // 默认中等分数

    let score = 0
    const originalLower = originalName.toLowerCase()

    // 检查包装类型
    if (packageType && originalLower.includes(packageType.toLowerCase())) {
      score += 60
    }

    // 检查规格大小
    if (size && originalLower.includes(size.toLowerCase())) {
      score += 40
    }

    return Math.min(100, score)
  }

  /**
   * 计算价格匹配得分
   */
  calculatePriceScore(originalPrice, productPrice, priceRange) {
    if (!originalPrice || !productPrice) return 50 // 无价格信息时给中等分数

    const priceDiff = Math.abs(originalPrice - productPrice)
    const avgPrice = (originalPrice + productPrice) / 2

    // 价格差异百分比
    const diffPercentage = avgPrice > 0 ? (priceDiff / avgPrice) * 100 : 100

    // 根据价格差异计算得分
    if (diffPercentage <= 5) return 100 // 5%以内差异
    if (diffPercentage <= 10) return 90 // 10%以内差异
    if (diffPercentage <= 20) return 70 // 20%以内差异
    if (diffPercentage <= 30) return 50 // 30%以内差异
    if (diffPercentage <= 50) return 30 // 50%以内差异
    return 10 // 超过50%差异
  }

  /**
   * 获取置信度等级
   */
  getConfidenceLevel(score) {
    if (score >= this.confidenceThresholds.auto) return "high"
    if (score >= this.confidenceThresholds.review) return "medium"
    return "low"
  }

  /**
   * 生成匹配原因
   */
  generateMatchReasons(originalData, product, score) {
    const reasons = []

    if (score.brand >= 80) {
      reasons.push({
        type: "brand_match",
        description: "品牌高度匹配",
        weight: score.brand / 100,
      })
    }

    if (score.name >= 70) {
      reasons.push({
        type: "name_similarity",
        description: "名称相似度高",
        weight: score.name / 100,
      })
    }

    if (score.keywords >= 60) {
      reasons.push({
        type: "keyword_match",
        description: "关键词匹配",
        weight: score.keywords / 100,
      })
    }

    if (score.price >= 70) {
      reasons.push({
        type: "price_range",
        description: "价格范围匹配",
        weight: score.price / 100,
      })
    }

    if (score.package >= 60) {
      reasons.push({
        type: "package_type",
        description: "包装规格匹配",
        weight: score.package / 100,
      })
    }

    return reasons
  }

  /**
   * 从名称中提取品牌
   */
  extractBrandFromName(name) {
    // 常见品牌列表（可以从数据库动态获取）
    const commonBrands = [
      "熊猫",
      "黄鹤楼",
      "南京",
      "云烟",
      "中华",
      "玉溪",
      "苏烟",
      "红塔山",
      "红河",
      "红金龙",
      "白沙",
      "芙蓉王",
      "利群",
      "红旗渠",
      "泰山",
      "黄山",
      "长白山",
      "贵烟",
      "兰州",
      "哈德门",
      "红梅",
      "恒大",
      "双喜",
      "真龙",
      "金叶",
      "娇子",
      "五叶神",
      "红云",
      "石林",
      "云龙",
      "红旗香",
      "金山",
      "好猫",
      "阿诗玛",
      "大重九",
      "将军",
      "红河道",
    ]

    for (const brand of commonBrands) {
      if (name.includes(brand)) {
        return brand
      }
    }

    return ""
  }

  /**
   * 提取关键词
   */
  extractKeywords(name) {
    // 简单的中文分词（实际项目中可以使用专业的分词库）
    const keywords = []
    const commonKeywords = [
      "硬",
      "软",
      "细支",
      "中支",
      "爆珠",
      "薄荷",
      "经典",
      "特醇",
      "新版",
      "典藏",
      "珍品",
      "精品",
      "豪华",
      "至尊",
      "王者",
      "帝王",
      "1916",
      "九五",
      "五星",
      "红",
      "蓝",
      "金",
      "银",
      "白",
      "黑",
      "醇香",
      "清香",
      "浓香",
      "淡雅",
      "醇厚",
      "绵柔",
      "甘醇",
      "香醇",
      "短支",
      "长支",
      "超细",
      "加长",
      "双爆",
      "三爆",
      "冰爆",
      "果爆",
      "限量",
      "纪念",
      "特供",
      "出口",
      "内供",
      "专供",
      "定制",
      "尊享",
    ]

    for (const keyword of commonKeywords) {
      if (name.includes(keyword)) {
        keywords.push(keyword)
      }
    }

    return keywords
  }

  /**
   * Jaccard相似度计算
   */
  jaccardSimilarity(str1, str2) {
    const set1 = new Set(str1)
    const set2 = new Set(str2)
    const intersection = new Set([...set1].filter((x) => set2.has(x)))
    const union = new Set([...set1, ...set2])

    return union.size > 0 ? intersection.size / union.size : 0
  }

  /**
   * 编辑距离计算
   */
  levenshteinDistance(str1, str2) {
    const m = str1.length
    const n = str2.length
    const dp = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0))

    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1]
        } else {
          dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1
        }
      }
    }

    return dp[m][n]
  }

  /**
   * 最长公共子序列
   */
  longestCommonSubsequence(str1, str2) {
    const m = str1.length
    const n = str2.length
    const dp = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0))

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        }
      }
    }

    return dp[m][n]
  }
}

const matchingEngine = new MatchingEngine()

/**
 * 创建匹配任务
 */
const createMatchingTask = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BusinessError("请上传文件")
  }

  const {
    templateId,
    threshold = 65,
    autoConfirmThreshold = 90,
    description = "",
    priority = "normal",
  } = req.body

  // 验证templateId参数
  if (!templateId) {
    throw new BusinessError("必须指定商品模板ID")
  }

  // 验证模板是否存在
  const ProductTemplate = require("../models/ProductTemplate")
  const template = await ProductTemplate.findById(templateId)
  if (!template) {
    throw new NotFoundError("商品模板")
  }

  logger.info("接收到文件上传", {
    原始文件名: req.file.originalname,
    文件大小: req.file.size,
  })

  // 创建匹配任务
  const task = new MatchingTask({
    templateId,
    templateName: template.name,
    filename: req.file.filename,
    originalFilename: req.file.originalname,
    fileSize: req.file.size,
    filePath: req.file.path,
    config: {
      threshold: Number(threshold),
      autoConfirmThreshold: Number(autoConfirmThreshold),
    },
    createdBy: req.user._id,
    metadata: {
      description,
      priority,
      source: "web_upload",
    },
  })

  await task.save()

  // 记录操作日志
  logOperation("创建匹配任务", req.user, {
    taskId: task._id,
    filename: task.originalFilename,
  })

  logger.info("匹配任务创建成功", {
    taskId: task._id,
    filename: task.originalFilename,
    userId: req.user._id,
  })

  res.status(201).json({
    success: true,
    message: "匹配任务创建成功",
    data: { task },
  })
})

/**
 * 开始执行匹配任务
 */
const executeMatchingTask = asyncHandler(async (req, res) => {
  const { id } = req.params

  const task = await MatchingTask.findById(id)
  if (!task) {
    throw new NotFoundError("匹配任务")
  }

  if (task.status !== "pending") {
    throw new BusinessError("任务状态不允许执行")
  }

  // 开始任务
  await task.start()

  // 异步执行匹配（不阻塞响应）
  processMatchingTask(task._id).catch((error) => {
    logger.error("匹配任务执行失败", { taskId: task._id, error: error.message })
  })

  res.json({
    success: true,
    message: "匹配任务已开始执行",
    data: { taskId: task._id, status: task.status },
  })
})

/**
 * 异步处理匹配任务
 */
async function processMatchingTask(taskId) {
  const task = await MatchingTask.findById(taskId)
  if (!task) return

  try {
    logger.info("开始处理匹配任务", { taskId })

    // 1. 解析文件
    const parseStart = Date.now()
    const rawData = await parseUploadedFile(
      task.filePath,
      task.originalFilename
    )
    task.statistics.processingTime.parsing = Date.now() - parseStart

    logger.info("文件解析完成", { taskId, 解析条数: rawData.length })

    // 2. 获取商品库（仅使用指定模板下的商品）
    const products = await Product.find({
      templateId: task.templateId,
      isActive: true,
    }).lean()
    logger.info("商品库加载完成", {
      taskId,
      templateId: task.templateId,
      商品库大小: products.length,
    })

    if (products.length === 0) {
      throw new Error("商品库为空，请先添加商品数据")
    }

    // 3. 更新任务进度
    task.progress.totalItems = rawData.length
    await task.updateProgress(task.progress)

    // 4. 执行匹配
    const matchingStart = Date.now()
    let processedCount = 0

    for (const [index, item] of rawData.entries()) {
      try {
        // 提取和处理价格
        const priceValue =
          item.price ||
          item.批发价格 ||
          item["批发价格"] ||
          item.批发价 ||
          item["批发价"] ||
          0
        const parsedPrice =
          typeof priceValue === "string"
            ? parseFloat(priceValue.replace(/[^\d.]/g, ""))
            : Number(priceValue)

        logger.info("价格处理", {
          原始价格: priceValue,
          解析后价格: parsedPrice,
          原始数据: item,
        })

        // 创建匹配记录（适应真实数据格式：只有批发名和批发价格）
        const record = new MatchingRecord({
          taskId: task._id,
          originalData: {
            name:
              item.批发名 ||
              item["批发名"] ||
              item.name ||
              item.商品名称 ||
              item["商品名称"] ||
              "",
            price: isNaN(parsedPrice) ? 0 : parsedPrice,
            quantity: Number(item.quantity || item.数量 || item["数量"]) || 1, // 默认1
            unit: item.unit || item.单位 || item["单位"] || "盒", // 默认"盒"
            supplier: item.supplier || item.供应商 || item["供应商"] || "", // 默认空
            rawData: item,
          },
          metadata: {
            source: {
              row: index + 2, // Excel行号（从2开始，1是标题）
              file: task.originalFilename,
            },
          },
        })

        // 执行匹配
        const candidates = await matchingEngine.match(
          record.originalData,
          products,
          task.config
        )

        logger.info("匹配完成", {
          taskId,
          原始名称: record.originalData.name,
          候选项数量: candidates.length,
          最佳分数: candidates[0]?.score.total || 0,
        })

        // 直接设置候选项数组（避免循环Promise调用）
        record.candidates = candidates
        await record.save()

        // 根据最佳匹配分数决定状态
        const bestScore = candidates[0]?.score.total || 0

        if (
          bestScore >= task.config.autoConfirmThreshold &&
          candidates.length > 0
        ) {
          // 自动确认
          record.selectedMatch = {
            productId: candidates[0].productId,
            confidence: bestScore,
            score: bestScore,
            confirmedBy: task.createdBy,
            confirmedAt: new Date(),
            note: "系统自动确认",
            matchType: "auto",
          }
          record.status = "confirmed"
          task.progress.confirmedItems++

          // 保存记录后立即更新商品批发价
          await record.save()
          await updateProductWholesalePrice(record, candidates[0].productId)
        } else if (
          bestScore >= task.config.threshold &&
          candidates.length > 0
        ) {
          // 需要人工审核
          record.status = "reviewing"
          task.progress.pendingItems++
        } else {
          // 低置信度，标记为异常
          record.status = "exception"
          record.exceptions.push({
            type: "low_confidence",
            message: `匹配置信度过低 (${bestScore}%)`,
            severity: "medium",
            createdAt: new Date(),
          })
          task.progress.exceptionItems++
        }

        // 只有非自动确认的记录才需要在这里保存
        if (record.status !== "confirmed") {
          await record.save()
        }

        processedCount++
        task.progress.processedItems = processedCount

        // 每处理10条记录更新一次进度
        if (processedCount % 10 === 0) {
          await task.updateProgress(task.progress)
        }
      } catch (error) {
        logger.error("处理匹配记录失败", {
          taskId,
          index,
          error: error.message,
        })

        task.progress.exceptionItems++
      }
    }

    // 5. 完成任务
    task.statistics.processingTime.matching = Date.now() - matchingStart
    await task.updateProgress(task.progress)

    // 计算统计信息
    const avgScore = await MatchingRecord.aggregate([
      { $match: { taskId: task._id } },
      {
        $group: {
          _id: null,
          avgScore: { $avg: { $arrayElemAt: ["$candidates.score.total", 0] } },
        },
      },
    ])

    task.statistics.averageConfidence = avgScore[0]?.avgScore || 0

    // 计算匹配率（确认+待审核的比例）
    const totalProcessed = task.progress.processedItems
    const successfulMatches =
      task.progress.confirmedItems + task.progress.pendingItems
    task.statistics.matchRate =
      totalProcessed > 0
        ? Math.round((successfulMatches / totalProcessed) * 100)
        : 0

    logger.info("统计信息计算完成", {
      taskId,
      totalProcessed,
      successfulMatches,
      matchRate: task.statistics.matchRate,
      averageConfidence: task.statistics.averageConfidence,
    })

    await task.updateStatistics(task.statistics)

    // 根据是否有待审核项目决定最终状态
    if (task.progress.pendingItems > 0 || task.progress.exceptionItems > 0) {
      task.status = "review"
      await task.save() // 保存review状态
      logger.info("任务进入审核状态", {
        taskId,
        pendingItems: task.progress.pendingItems,
        exceptionItems: task.progress.exceptionItems,
      })
    } else {
      await task.complete()
      logger.info("任务自动完成", { taskId })
    }

    logger.info("匹配任务完成", {
      taskId,
      totalItems: task.progress.totalItems,
      confirmedItems: task.progress.confirmedItems,
      pendingItems: task.progress.pendingItems,
      exceptionItems: task.progress.exceptionItems,
    })
  } catch (error) {
    logger.error("匹配任务执行失败", { taskId, error: error.message })
    await task.fail(error.message)
  } finally {
    // 清理临时文件
    try {
      if (task?.filePath && fs.existsSync(task.filePath)) {
        fs.unlinkSync(task.filePath)
        logger.info("临时文件已清理", { filePath: task.filePath })
      }
    } catch (cleanupError) {
      logger.warn("清理临时文件失败", {
        filePath: task?.filePath,
        error: cleanupError.message,
      })
    }
  }
}

/**
 * 解析上传的文件
 */
async function parseUploadedFile(filePath, filename) {
  const fileExtension = path.extname(filename).toLowerCase()

  logger.info("开始解析文件", {
    filePath,
    filename,
    fileExtension,
    fileExists: fs.existsSync(filePath),
  })

  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }

  try {
    let result
    if (fileExtension === ".xlsx" || fileExtension === ".xls") {
      result = parseExcelFile(filePath)
    } else if (fileExtension === ".csv") {
      result = parseCSVFile(filePath)
    } else {
      throw new Error("不支持的文件格式")
    }

    logger.info("文件解析成功", {
      filePath,
      解析条数: result?.length || 0,
    })

    return result
  } catch (error) {
    logger.error("文件解析失败", {
      filePath,
      filename,
      error: error.message,
    })
    throw error
  }
}

/**
 * 解析Excel文件
 */
function parseExcelFile(filePath) {
  const workbook = xlsx.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  return xlsx.utils.sheet_to_json(worksheet)
}

/**
 * 解析CSV文件
 */
function parseCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = []
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject)
  })
}

/**
 * 获取匹配任务列表
 */
const getMatchingTasks = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, priority } = req.query

  const query = { createdBy: req.user._id }
  if (status) query.status = status
  if (priority) query["metadata.priority"] = priority

  const [tasks, total] = await Promise.all([
    MatchingTask.find(query)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean(),
    MatchingTask.countDocuments(query),
  ])

  res.json({
    success: true,
    data: {
      tasks,
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
 * 获取匹配任务详情
 */
const getMatchingTaskById = asyncHandler(async (req, res) => {
  const { id } = req.params

  const task = await MatchingTask.findById(id)
    .populate("createdBy", "name email")
    .populate("assignedTo.user", "name email")

  if (!task) {
    throw new NotFoundError("匹配任务")
  }

  // 获取匹配记录统计
  const recordStats = await MatchingRecord.getMatchingStatistics(id)

  res.json({
    success: true,
    data: {
      task,
      recordStats: recordStats[0] || { total: 0, statusCounts: [] },
    },
  })
})

/**
 * 获取待审核的匹配记录
 */
const getPendingReviews = asyncHandler(async (req, res) => {
  const {
    taskId,
    page = 1,
    limit = 20,
    priority,
    sortBy = "priority",
  } = req.query

  const filters = {}
  if (taskId) filters.taskId = taskId
  if (priority) filters.priority = priority

  const [records, total] = await Promise.all([
    MatchingRecord.getPendingReviews(filters, parseInt(limit), sortBy),
    MatchingRecord.countDocuments({
      status: { $in: ["reviewing", "exception"] },
      ...filters,
    }),
  ])

  res.json({
    success: true,
    data: {
      records,
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
 * 获取所有匹配记录（包括已确认、已拒绝等）
 */
const getAllMatchingRecords = asyncHandler(async (req, res) => {
  const { taskId, page = 1, limit = 20, status } = req.query

  const filters = {}
  if (taskId) filters.taskId = taskId
  if (status) filters.status = status

  const [records, total] = await Promise.all([
    MatchingRecord.find(filters)
      .populate(
        "candidates.productId",
        "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
      )
      .populate(
        "selectedMatch.productId",
        "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
      )
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean(),
    MatchingRecord.countDocuments(filters),
  ])

  res.json({
    success: true,
    data: {
      records,
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
 * 审核匹配记录
 */
const reviewMatchingRecord = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { action, productId, note } = req.body

  const record = await MatchingRecord.findById(id)
  if (!record) {
    throw new NotFoundError("匹配记录")
  }

  if (
    !["reviewing", "confirmed", "rejected", "exception"].includes(record.status)
  ) {
    throw new BusinessError(`记录状态不允许修改，当前状态: ${record.status}`)
  }

  let result

  if (action === "confirm" && productId) {
    result = await record.confirmMatch(productId, req.user._id, note, "manual")

    // 更新商品的批发价信息
    await updateProductWholesalePrice(record, productId)
  } else if (action === "reject") {
    result = await record.rejectMatch(req.user._id, note)
  } else {
    throw new BusinessError("无效的审核操作")
  }

  // 记录用户行为用于学习
  await record.recordUserBehavior(req.user._id, action, {
    productId,
    note,
    timestamp: new Date(),
  })

  // 检查任务是否所有审核都已完成，并更新任务状态
  await updateTaskStatusAfterReview(record.taskId)

  // 记录操作日志
  logOperation("审核匹配记录", req.user, {
    recordId: record._id,
    action,
    productId,
  })

  res.json({
    success: true,
    message: `${action === "confirm" ? "确认" : "拒绝"}成功`,
    data: { record: result },
  })
})

/**
 * 修改匹配记录的原始名称
 */
const updateOriginalName = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { originalName } = req.body

  // 验证输入
  if (
    !originalName ||
    typeof originalName !== "string" ||
    !originalName.trim()
  ) {
    throw new BusinessError("原始名称不能为空")
  }

  const record = await MatchingRecord.findById(id)
  if (!record) {
    throw new NotFoundError("匹配记录")
  }

  // 保存旧的名称用于日志
  const oldName = record.originalData.name

  // 更新原始名称
  record.originalData.name = originalName.trim()
  record.metadata.lastModified = new Date()
  record.metadata.modifiedBy = req.user._id

  await record.save()

  // 记录操作日志
  logOperation("修改原始名称", req.user, {
    recordId: record._id,
    taskId: record.taskId,
    oldName: oldName,
    newName: originalName.trim(),
  })

  res.json({
    success: true,
    message: "原始名称更新成功",
    data: {
      record,
    },
  })
})

/**
 * 批量审核匹配记录
 */
const batchReviewMatchingRecords = asyncHandler(async (req, res) => {
  const { recordIds, action, productIds, note } = req.body

  if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
    throw new BusinessError("请提供要审核的记录ID列表")
  }

  if (!["confirm", "reject"].includes(action)) {
    throw new BusinessError("无效的审核操作")
  }

  // 对于确认操作，需要productIds数组
  if (action === "confirm" && (!productIds || !Array.isArray(productIds))) {
    throw new BusinessError("确认操作需要提供对应的产品ID列表")
  }

  const results = {
    success: [],
    failed: [],
    total: recordIds.length,
  }

  // 批量处理记录
  for (let i = 0; i < recordIds.length; i++) {
    const recordId = recordIds[i]

    try {
      const record = await MatchingRecord.findById(recordId)

      if (!record) {
        results.failed.push({
          recordId,
          error: "记录不存在",
        })
        continue
      }

      // 允许对 "reviewing" 和 "exception" 状态进行批量审核
      if (record.status !== "reviewing" && record.status !== "exception") {
        results.failed.push({
          recordId,
          error: "记录状态不允许审核",
        })
        continue
      }

      let result
      if (action === "confirm") {
        const productId = productIds[i]
        if (!productId) {
          results.failed.push({
            recordId,
            error: "缺少产品ID",
          })
          continue
        }
        result = await record.confirmMatch(
          productId,
          req.user._id,
          note || "批量确认",
          "manual"
        )

        // 更新商品的批发价信息
        await updateProductWholesalePrice(record, productId)
      } else {
        result = await record.rejectMatch(req.user._id, note || "批量拒绝")
      }

      // 记录用户行为
      await record.recordUserBehavior(req.user._id, action, {
        productId: action === "confirm" ? productIds[i] : null,
        note: note || `批量${action === "confirm" ? "确认" : "拒绝"}`,
        timestamp: new Date(),
        batchOperation: true,
      })

      results.success.push({
        recordId,
        originalName: record.originalData.name,
      })
    } catch (error) {
      logger.error("批量审核单个记录失败", {
        recordId,
        error: error.message,
      })

      results.failed.push({
        recordId,
        error: error.message,
      })
    }
  }

  // 如果有成功的记录，更新任务状态
  if (results.success.length > 0) {
    const taskIds = await MatchingRecord.find({
      _id: { $in: recordIds },
    }).distinct("taskId")

    for (const taskId of taskIds) {
      await updateTaskStatusAfterReview(taskId)
    }
  }

  // 记录操作日志
  logOperation("批量审核匹配记录", req.user, {
    action,
    totalRecords: results.total,
    successCount: results.success.length,
    failedCount: results.failed.length,
  })

  logger.info("批量审核完成", {
    action,
    total: results.total,
    success: results.success.length,
    failed: results.failed.length,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: `批量${action === "confirm" ? "确认" : "拒绝"}完成`,
    data: results,
  })
})

/**
 * 删除匹配任务
 */
const deleteMatchingTask = asyncHandler(async (req, res) => {
  const { id } = req.params

  const task = await MatchingTask.findById(id)
  if (!task) {
    throw new NotFoundError("匹配任务")
  }

  // 检查权限：只能删除自己创建的任务
  if (task.createdBy.toString() !== req.user._id.toString()) {
    throw new BusinessError("无权删除此任务")
  }

  // 删除相关的匹配记录
  await MatchingRecord.deleteMany({ taskId: id })

  // 删除任务
  await MatchingTask.findByIdAndDelete(id)

  // 记录操作日志
  logOperation("删除匹配任务", req.user, {
    taskId: id,
    filename: task.originalFilename,
  })

  logger.info("匹配任务删除成功", {
    taskId: id,
    filename: task.originalFilename,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "匹配任务删除成功",
  })
})

/**
 * 审核完成后更新任务状态
 */
async function updateTaskStatusAfterReview(taskId) {
  try {
    logger.info("开始更新任务状态", { taskId })

    const task = await MatchingTask.findById(taskId)
    if (!task) {
      logger.warn("任务不存在", { taskId })
      return
    }

    // 获取该任务的所有记录统计
    const recordStats = await MatchingRecord.aggregate([
      { $match: { taskId: new mongoose.Types.ObjectId(taskId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          confirmed: {
            $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
          },
          reviewing: {
            $sum: { $cond: [{ $eq: ["$status", "reviewing"] }, 1, 0] },
          },
          exception: {
            $sum: { $cond: [{ $eq: ["$status", "exception"] }, 1, 0] },
          },
        },
      },
    ])

    if (recordStats.length === 0) {
      logger.warn("没有找到记录统计", { taskId })
      return
    }

    const stats = recordStats[0]

    logger.info("获取到记录统计", {
      taskId,
      stats: {
        total: stats.total,
        confirmed: stats.confirmed,
        rejected: stats.rejected,
        reviewing: stats.reviewing,
        exception: stats.exception,
      },
    })

    // 更新任务的进度统计
    task.progress.confirmedItems = stats.confirmed
    task.progress.rejectedItems = stats.rejected
    task.progress.pendingItems = stats.reviewing
    task.progress.exceptionItems = stats.exception
    task.progress.processedItems = stats.total

    // 重新计算匹配率
    const successfulMatches = stats.confirmed
    const totalProcessed = stats.total
    task.statistics.matchRate =
      totalProcessed > 0
        ? Math.round((successfulMatches / totalProcessed) * 100)
        : 0

    logger.info("更新任务统计完成", {
      taskId,
      matchRate: task.statistics.matchRate,
      progress: task.progress,
    })

    // 检查是否所有审核都已完成（只考虑reviewing状态，exception不阻止完成）
    const pendingCount = stats.reviewing
    if (pendingCount === 0) {
      // 所有审核已完成，更新任务状态
      task.status = "completed"
      task.completedAt = new Date()

      logger.info("匹配任务审核全部完成", {
        taskId,
        confirmedItems: stats.confirmed,
        rejectedItems: stats.rejected,
        exceptionItems: stats.exception,
        matchRate: task.statistics.matchRate,
      })
    } else {
      // 仍有待审核项目
      task.status = "review"
      logger.info("匹配任务仍有待审核项目", {
        taskId,
        pendingCount: stats.reviewing,
        exceptionCount: stats.exception,
      })
    }

    await task.save()
  } catch (error) {
    logger.error("更新任务状态失败", {
      taskId,
      error: error.message,
    })
  }
}

/**
 * 手动更新任务状态
 */
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { id } = req.params

  const task = await MatchingTask.findById(id)
  if (!task) {
    throw new NotFoundError("匹配任务")
  }

  // 更新任务状态
  await updateTaskStatusAfterReview(id)

  // 获取更新后的任务信息
  const updatedTask = await MatchingTask.findById(id)

  logger.info("手动更新任务状态", {
    taskId: id,
    oldStatus: task.status,
    newStatus: updatedTask.status,
    matchRate: updatedTask.statistics.matchRate,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "任务状态更新成功",
    data: { task: updatedTask },
  })
})

/**
 * 导出匹配结果为Excel
 */
const exportMatchingResults = asyncHandler(async (req, res) => {
  const { taskId } = req.params
  const { format = "excel", sortBy = "confidence_desc" } = req.query

  const task = await MatchingTask.findById(taskId)
  if (!task) {
    throw new NotFoundError("匹配任务")
  }

  // 获取所有匹配记录
  const records = await MatchingRecord.find({ taskId })
    .populate(
      "selectedMatch.productId",
      "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
    )
    .sort({ "metadata.source.row": 1 })

  if (records.length === 0) {
    throw new BusinessError("没有可导出的记录")
  }

  const Excel = require("exceljs")
  const workbook = new Excel.Workbook()

  // 创建主工作表
  const worksheet = workbook.addWorksheet("匹配结果")

  // 设置列定义 - 按照用户要求的顺序：商品名称、盒码、条码、公司价、品牌、批发名、批发价
  worksheet.columns = [
    { header: "商品名称", key: "matchedName", width: 25 },
    { header: "盒码", key: "boxCode", width: 15 },
    { header: "条码", key: "barcode", width: 15 },
    { header: "公司价", key: "companyPrice", width: 12 },
    { header: "品牌", key: "matchedBrand", width: 15 },
    { header: "批发名", key: "originalName", width: 25 },
    { header: "批发价", key: "originalPrice", width: 12 },
  ]

  // 样式定义
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: "FFFFFF" } }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "366EF7" },
  }
  headerRow.alignment = { horizontal: "center" }

  // 只导出已确认且有匹配商品的记录
  let exportable = records.filter(
    (r) => r.status === "confirmed" && r.selectedMatch?.productId
  )

  // 根据 sortBy 排序
  const getCompanyPrice = (r) =>
    r.selectedMatch?.productId?.pricing?.companyPrice ||
    r.selectedMatch?.productId?.pricing?.retailPrice ||
    0

  switch (sortBy) {
    case "confidence_desc":
      exportable = exportable.sort(
        (a, b) =>
          (b.selectedMatch?.confidence || 0) -
          (a.selectedMatch?.confidence || 0)
      )
      break
    case "confidence_asc":
      exportable = exportable.sort(
        (a, b) =>
          (a.selectedMatch?.confidence || 0) -
          (b.selectedMatch?.confidence || 0)
      )
      break
    case "price_desc":
      exportable = exportable.sort(
        (a, b) => getCompanyPrice(b) - getCompanyPrice(a)
      )
      break
    case "price_asc":
      exportable = exportable.sort(
        (a, b) => getCompanyPrice(a) - getCompanyPrice(b)
      )
      break
    default:
      break
  }

  // 添加数据行
  exportable.forEach((record) => {
    worksheet.addRow({
      matchedName: record.selectedMatch?.productId?.name || "",
      boxCode: record.selectedMatch?.productId?.boxCode || "",
      // 条码为产品编码 productCode
      barcode: record.selectedMatch?.productId?.productCode || "",
      // 公司价读取 pricing.companyPrice，若无则回退到零售价
      companyPrice:
        record.selectedMatch?.productId?.pricing?.companyPrice ||
        record.selectedMatch?.productId?.pricing?.retailPrice ||
        0,
      matchedBrand: record.selectedMatch?.productId?.brand || "",
      originalName: record.originalData.name || "",
      originalPrice: record.originalData.price || 0,
    })
  })

  // 设置列宽自适应
  worksheet.columns.forEach((column) => {
    column.width = Math.max(column.width || 10, 10)
  })

  // 设置响应头
  const baseFilename = task.originalFilename
    ? path.parse(task.originalFilename).name // 去掉扩展名
    : "结果"
  const filename = `匹配结果_${baseFilename}_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
  )

  // 输出Excel文件
  await workbook.xlsx.write(res)

  // 计算导出的记录数（只包含已确认的记录）
  const exportedRecords = exportable

  // 记录操作日志
  logOperation("导出匹配结果", req.user, {
    taskId,
    recordCount: exportedRecords.length,
    format: "excel",
  })

  logger.info("导出匹配结果完成", {
    taskId,
    recordCount: exportedRecords.length,
    totalRecords: records.length,
    filename,
    userId: req.user._id,
  })
})

/**
 * 更新商品的批发价信息
 */
async function updateProductWholesalePrice(record, productId) {
  try {
    // 获取原始批发价格
    const originalPrice = record.originalData.price
    const originalName = record.originalData.name

    if (!originalPrice || originalPrice <= 0) {
      logger.warn("批发价格无效，跳过更新", {
        recordId: record._id,
        productId,
        originalPrice,
      })
      return
    }

    // 更新商品的批发价信息
    const updateData = {
      "wholesale.name": originalName,
      "wholesale.price": originalPrice,
      "wholesale.unit": record.originalData.unit || "元/条",
      "wholesale.updatedAt": new Date(),
      "wholesale.source": "matching",
      "wholesale.lastMatchingRecord": record._id,
    }

    await Product.findByIdAndUpdate(productId, updateData, { new: true })

    logger.info("商品批发价更新成功", {
      productId,
      recordId: record._id,
      originalName,
      originalPrice,
      updatedAt: new Date(),
    })
  } catch (error) {
    logger.error("更新商品批发价失败", {
      recordId: record._id,
      productId,
      error: error.message,
    })
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 获取所有匹配成功的商品
 */
const getMatchedProducts = asyncHandler(async (req, res) => {
  try {
    // 获取所有已确认的匹配记录
    const records = await MatchingRecord.find({
      status: "confirmed",
      "selectedMatch.productId": { $exists: true },
    })
      .populate(
        "selectedMatch.productId",
        "name brand company productType packageType specifications chemicalContent appearance features pricing productCode boxCode"
      )
      .populate("taskId", "originalFilename createdAt")
      .sort({ "reviewHistory.0.timestamp": -1 })

    if (records.length === 0) {
      return res.json({
        success: true,
        message: "暂无匹配商品数据",
        data: [],
      })
    }

    // 处理数据格式
    const matchedProducts = records.map((record) => {
      const reviewTime =
        record.reviewHistory.length > 0
          ? record.reviewHistory[record.reviewHistory.length - 1].timestamp
          : record.updatedAt

      const originalPrice = record.originalData.price || 0
      const companyPrice =
        (record.selectedMatch.productId.pricing &&
          (record.selectedMatch.productId.pricing.companyPrice ||
            record.selectedMatch.productId.pricing.retailPrice)) ||
        0
      const quantity = record.originalData.quantity || 1

      return {
        _id: record._id,
        productId: {
          _id: record.selectedMatch.productId._id,
          name: record.selectedMatch.productId.name,
          brand: record.selectedMatch.productId.brand,
          companyPrice: companyPrice,
          barcode: record.selectedMatch.productId.barcode || "",
          boxCode: record.selectedMatch.productId.boxCode || "",
        },
        originalData: {
          name: record.originalData.name || "",
          price: originalPrice,
          quantity: quantity,
          supplier: record.originalData.supplier || "",
        },
        confidence: record.selectedMatch.confidence || 0,
        matchType: record.selectedMatch.matchType || "manual",
        taskInfo: {
          _id: record.taskId._id,
          originalFilename: record.taskId.originalFilename,
          createdAt: record.taskId.createdAt,
        },
        confirmedAt: reviewTime,
        priceGap: originalPrice - companyPrice, // 价格差异
        totalValue: quantity * companyPrice, // 总价值
      }
    })

    // 记录操作日志
    logOperation("查看匹配商品清单", req.user, {
      totalRecords: matchedProducts.length,
    })

    logger.info("获取匹配商品清单", {
      totalRecords: matchedProducts.length,
      userId: req.user._id,
    })

    res.json({
      success: true,
      message: "获取匹配商品成功",
      data: matchedProducts,
    })
  } catch (error) {
    logger.error("获取匹配商品失败", {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
    })

    throw new BusinessError("获取匹配商品数据失败")
  }
})

module.exports = {
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
}
