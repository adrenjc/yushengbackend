/**
 * 智能匹配系统控制器 - 全新设计
 * 专注于高准确率的名称匹配，激进的自动确认策略
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
const MatchingMemory = require("../models/MatchingMemory")

/**
 * 全新智能匹配引擎 - 专注名称匹配
 */
class AggressiveMatchingEngine {
  constructor() {
    // 完全基于名称的权重配置
    this.weights = {
      name: 1.0, // 100% 名称权重
      price: 0.0, // 价格仅用于过滤，不参与评分
    }

    // 动态品牌库
    this.brands = new Set()

    // 规格词汇（用于识别但不作为强匹配依据）
    this.specificationWords = new Set([
      "硬",
      "软",
      "细支",
      "中支",
      "大支",
      "粗支",
      "短支",
      "长支",
      "超细",
      "硬盒",
      "软盒",
      "双中支",
      "爆珠",
      "薄荷",
      "醇香",
      "淡雅",
    ])

    // 常见同义词映射（移除规格词）
    this.synonyms = new Map([
      ["硬", "硬盒"],
      ["软", "软盒"],
      ["薄荷", "爆珠"],
    ])

    // 常见品牌词汇（会动态更新）
    this.commonBrands = [
      "中华",
      "玉溪",
      "云烟",
      "苏烟",
      "黄鹤楼",
      "南京",
      "红塔山",
      "白沙",
      "芙蓉王",
      "利群",
      "黄山",
      "长白山",
      "双喜",
      "真龙",
      "金叶",
      "娇子",
      "红河",
      "贵烟",
      "兰州",
      "泰山",
      "好猫",
      "红梅",
      "黄金叶",
      "五叶神",
      "大重九",
      "将军",
      "红云",
    ]
  }

  /**
   * 设置动态品牌列表
   */
  setBrands(brandList) {
    this.brands = new Set([...this.commonBrands, ...(brandList || [])])
  }

  /**
   * 核心匹配方法 - 集成记忆功能
   */
  async match(originalData, products, config = {}) {
    const candidates = []
    const originalName = this.normalize(originalData.name || "")

    if (!originalName) return []

    // 1. 优先查询记忆匹配（包含模板过滤）
    let memoryMatches = []
    try {
      console.log(`🔍 查询记忆匹配:`, {
        原始名称: originalData.name,
        标准化名称: originalName,
        模板ID: config.templateId,
      })

      memoryMatches = await MatchingMemory.findMatching(originalName, {
        limit: 3,
        minConfidence: 60,
        includeDeprecated: false,
        templateId: config.templateId,
      })

      console.log(`🧠 记忆查询结果: 找到 ${memoryMatches.length} 个匹配项`)

      if (memoryMatches.length > 0) {
        console.log(
          `🧠 找到 ${memoryMatches.length} 个记忆匹配项:`,
          originalData.name,
          memoryMatches.map((m) => ({
            标准化名称: m.normalizedWholesaleName,
            确认次数: m.confirmCount,
            置信度: m.confidence,
            商品名称: m.confirmedProductId?.name,
          }))
        )

        // 将记忆匹配转换为候选项
        for (const memory of memoryMatches) {
          const product = products.find(
            (p) => p._id.toString() === memory.confirmedProductId._id.toString()
          )

          if (product) {
            // 确保trustScore是有效数字，设置默认值
            const baseTrustScore =
              Number(memory.trustScore) || memory.confidence || 85

            // 根据确认次数提升分数 - 高确认次数应该有更高分数
            const confirmCountBonus = Math.min(
              20,
              (memory.confirmCount || 1) * 3
            ) // 每次确认+3分，最多+20分
            const memoryScore = Math.min(
              100,
              Math.max(80, baseTrustScore + confirmCountBonus + 15)
            ) // 记忆匹配基础加分15，最低80分

            console.log(`🧠 记忆匹配分数计算:`, {
              商品: memory.confirmedProductId?.name,
              确认次数: memory.confirmCount,
              基础分数: baseTrustScore,
              确认次数加分: confirmCountBonus,
              最终分数: memoryScore,
            })

            candidates.push({
              productId: product._id,
              score: {
                name: memoryScore,
                brand: 100, // 记忆匹配品牌满分
                total: memoryScore,
                memoryBonus: confirmCountBonus + 15,
              },
              confidence: "high",
              reasons: [
                {
                  type: "memory_match",
                  description: `记忆匹配 (确认${memory.confirmCount || 1}次)`,
                  weight: 1.0,
                },
              ],
              rank: 0,
              isMemoryMatch: true,
              memorySource: memory,
            })
          }
        }
      }
    } catch (memoryError) {
      console.error("记忆查询失败:", memoryError)
    }

    // 2. 常规算法匹配
    for (const product of products) {
      // 跳过已经通过记忆匹配的商品
      const alreadyMatched = candidates.some(
        (c) => c.productId.toString() === product._id.toString()
      )
      if (alreadyMatched) continue

      const productName = this.normalize(product.name || "")
      if (!productName) continue

      const score = this.calculateScore(
        originalName,
        productName,
        originalData,
        product
      )

      if (score >= 30) {
        // 更低门槛，确保有候选项
        const confidenceLevel = this.getConfidenceLevel(score)
        const candidate = {
          productId: product._id,
          score: {
            name: score,
            total: score,
          },
          confidence: confidenceLevel,
          reasons: this.generateReasons(score),
          rank: 0,
        }

        console.log(`📊 生成候选项:`, {
          商品名称: product.name,
          分数: score,
          置信度: confidenceLevel,
          候选项: candidate,
        })

        candidates.push(candidate)
      }
    }

    // 按分数排序 (记忆匹配优先)
    candidates.sort((a, b) => {
      // 记忆匹配优先
      if (a.isMemoryMatch && !b.isMemoryMatch) return -1
      if (!a.isMemoryMatch && b.isMemoryMatch) return 1
      // 同类型按分数排序
      return b.score.total - a.score.total
    })

    candidates.forEach((candidate, index) => {
      candidate.rank = index + 1
    })

    return candidates.slice(0, 10)
  }

  /**
   * 计算匹配分数 - 核心算法
   */
  calculateScore(original, product, originalData, productData) {
    // 1. 预处理文本
    const orig = this.deepNormalize(original)
    const prod = this.deepNormalize(product)

    if (!orig || !prod) return 0

    // 2. 品牌一致性检查（提前进行，避免跨品牌高分）
    if (this.hasBrandConflict(orig, prod)) {
      return 15 // 品牌冲突直接返回低分
    }

    // 3. 完全匹配
    if (orig === prod) return 100

    // 4. 去品牌后完全匹配
    const origNoBrand = this.removeBrand(orig)
    const prodNoBrand = this.removeBrand(prod)
    if (origNoBrand && prodNoBrand && origNoBrand === prodNoBrand) return 98

    // 5. 检查是否主要依赖规格词匹配（降低跨品牌规格词匹配）
    const specOnlyMatch = this.isSpecificationOnlyMatch(orig, prod)
    if (specOnlyMatch) {
      // 如果主要是规格词匹配且品牌不同，大幅降分
      const origBrand = this.detectBrand(orig)
      const prodBrand = this.detectBrand(prod)
      if (origBrand && prodBrand && origBrand !== prodBrand) {
        return Math.min(50, this.calculateSimilarity(orig, prod)) // 最高50分
      }
    }

    // 6. 容错匹配（括号、顺序、同义词）
    const tolerance = this.tolerantMatch(orig, prod)
    if (tolerance >= 95) return tolerance

    // 7. 包含匹配
    const containment = this.calculateContainment(orig, prod)
    if (containment >= 85) return containment

    // 8. 编辑距离匹配
    const similarity = this.calculateSimilarity(orig, prod)

    // 9. 价格合理性检查（仅用于加分或减分）
    const priceBonus = this.calculatePriceBonus(originalData, productData)

    let finalScore = similarity + priceBonus

    return Math.max(0, Math.min(100, Math.round(finalScore)))
  }

  /**
   * 文本标准化
   */
  normalize(text) {
    if (!text) return ""
    return text
      .toLowerCase()
      .replace(/[（()）\[\]【】]/g, "") // 移除所有括号
      .replace(/[·•\-_\s]/g, "") // 移除分隔符和空格
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, "") // 只保留中文英文数字
  }

  /**
   * 深度标准化（处理同义词）
   */
  deepNormalize(text) {
    let result = this.normalize(text)

    // 应用同义词替换
    for (const [key, value] of this.synonyms) {
      result = result.replace(new RegExp(key, "g"), value)
    }

    // 数字标准化
    result = result
      .replace(/一/g, "1")
      .replace(/二/g, "2")
      .replace(/三/g, "3")
      .replace(/四/g, "4")
      .replace(/五/g, "5")
      .replace(/六/g, "6")
      .replace(/七/g, "7")
      .replace(/八/g, "8")
      .replace(/九/g, "9")
      .replace(/十/g, "10")

    return result
  }

  /**
   * 移除品牌词
   */
  removeBrand(text) {
    let result = text
    for (const brand of this.brands) {
      const normalizedBrand = this.normalize(brand)
      if (normalizedBrand && result.includes(normalizedBrand)) {
        result = result.replace(normalizedBrand, "")
        break // 只移除第一个匹配的品牌
      }
    }
    return result.trim()
  }

  /**
   * 检查是否主要依赖规格词匹配
   */
  isSpecificationOnlyMatch(orig, prod) {
    // 移除品牌和规格词，看剩余内容是否很少
    const origNoBrand = this.removeBrand(orig)
    const prodNoBrand = this.removeBrand(prod)

    const origNoSpec = this.removeSpecifications(origNoBrand)
    const prodNoSpec = this.removeSpecifications(prodNoBrand)

    // 如果去除规格词后，剩余内容很少且不相似，说明主要依赖规格词
    return (
      (origNoSpec.length <= 2 || prodNoSpec.length <= 2) &&
      origNoSpec !== prodNoSpec
    )
  }

  /**
   * 移除规格词
   */
  removeSpecifications(text) {
    let result = text
    for (const spec of this.specificationWords) {
      result = result.replace(new RegExp(spec, "g"), "")
    }
    return result.trim()
  }

  /**
   * 容错匹配（处理括号、顺序等）
   */
  tolerantMatch(orig, prod) {
    // 展开括号内容
    const expandBrackets = (str) => {
      return str.replace(/\(([^)]+)\)/g, "$1")
    }

    const origExpanded = expandBrackets(orig)
    const prodExpanded = expandBrackets(prod)

    // 字符排序比较（忽略顺序）
    const sortChars = (str) => str.split("").sort().join("")

    const origSorted = sortChars(this.removeBrand(origExpanded))
    const prodSorted = sortChars(this.removeBrand(prodExpanded))

    if (origSorted && prodSorted && origSorted === prodSorted) return 97

    // 长度差异容忍
    const lengthDiff = Math.abs(origExpanded.length - prodExpanded.length)
    if (lengthDiff <= 2) {
      if (
        origExpanded.includes(prodExpanded) ||
        prodExpanded.includes(origExpanded)
      ) {
        return 95
      }
    }

    return 0
  }

  /**
   * 包含关系匹配
   */
  calculateContainment(orig, prod) {
    const origClean = this.removeBrand(orig)
    const prodClean = this.removeBrand(prod)

    if (!origClean || !prodClean) return 0

    // 完全包含
    if (origClean.includes(prodClean) || prodClean.includes(origClean)) {
      const ratio =
        Math.min(origClean.length, prodClean.length) /
        Math.max(origClean.length, prodClean.length)
      return 80 + ratio * 15 // 80-95分
    }

    // 部分包含 - 更宽松的匹配
    const shortStr = origClean.length < prodClean.length ? origClean : prodClean
    const longStr = origClean.length < prodClean.length ? prodClean : origClean

    if (shortStr.length >= 2 && longStr.includes(shortStr)) {
      return 75 // 部分包含给75分
    }

    // 关键词包含
    const origWords = this.extractKeywords(origClean)
    const prodWords = this.extractKeywords(prodClean)

    const intersection = origWords.filter((word) => prodWords.includes(word))
    const union = [...new Set([...origWords, ...prodWords])]

    if (intersection.length > 0 && union.length > 0) {
      const jaccard = intersection.length / union.length
      return Math.round(60 + jaccard * 25) // 60-85分
    }

    return 0
  }

  /**
   * 相似度计算
   */
  calculateSimilarity(orig, prod) {
    // Levenshtein距离
    const levenshtein = this.levenshteinDistance(orig, prod)
    const maxLen = Math.max(orig.length, prod.length)
    const similarity = maxLen > 0 ? (maxLen - levenshtein) / maxLen : 0

    // Jaccard相似度
    const set1 = new Set(orig)
    const set2 = new Set(prod)
    const intersection = new Set([...set1].filter((x) => set2.has(x)))
    const union = new Set([...set1, ...set2])
    const jaccard = union.size > 0 ? intersection.size / union.size : 0

    // 组合相似度
    const combined = similarity * 0.7 + jaccard * 0.3

    // 转换为分数
    let score = combined * 100

    // 高相似度奖励
    if (similarity >= 0.9) score += 10
    else if (similarity >= 0.8) score += 5

    return Math.round(score)
  }

  /**
   * 价格合理性加分
   */
  calculatePriceBonus(originalData, productData) {
    const origPrice = originalData.price || 0
    const prodPrice =
      productData.companyPrice || productData.specifications?.price || 0

    if (!origPrice || !prodPrice) return 0

    const diff = Math.abs(origPrice - prodPrice)
    const avgPrice = (origPrice + prodPrice) / 2
    const relDiff = avgPrice > 0 ? diff / avgPrice : 1

    // 价格接近加分
    if (diff <= 10) return 5 // 差异10元内 +5分
    if (diff <= 30) return 3 // 差异30元内 +3分
    if (relDiff <= 0.1) return 5 // 相对差异10%内 +5分
    if (relDiff <= 0.2) return 2 // 相对差异20%内 +2分

    // 价格差异过大减分
    if (diff > 200 || relDiff > 0.5) return -10

    return 0
  }

  /**
   * 检查品牌冲突
   */
  hasBrandConflict(orig, prod) {
    const origBrand = this.detectBrand(orig)
    const prodBrand = this.detectBrand(prod)

    if (origBrand && prodBrand && origBrand !== prodBrand) {
      return true
    }
    return false
  }

  /**
   * 检测品牌
   */
  detectBrand(text) {
    for (const brand of this.brands) {
      const normalizedBrand = this.normalize(brand)
      if (normalizedBrand && text.includes(normalizedBrand)) {
        return normalizedBrand
      }
    }
    return null
  }

  /**
   * 提取关键词
   */
  extractKeywords(text) {
    // 简单分词：2个字符以上的连续片段
    const matches = text.match(/[\u4e00-\u9fa5]{2,}/g) || []
    return [...new Set(matches)]
  }

  /**
   * 计算编辑距离
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
   * 获取置信度等级
   */
  getConfidenceLevel(score) {
    if (score >= 80) return "high"
    if (score >= 60) return "medium"
    return "low"
  }

  /**
   * 生成匹配原因
   */
  generateReasons(score) {
    const reasons = []
    if (score >= 95) {
      reasons.push({
        type: "name_similarity",
        description: "名称高度匹配",
        weight: 1.0,
      })
    } else if (score >= 85) {
      reasons.push({
        type: "name_similarity",
        description: "名称强相似",
        weight: 0.9,
      })
    } else if (score >= 70) {
      reasons.push({
        type: "name_similarity",
        description: "名称相似",
        weight: 0.8,
      })
    } else {
      reasons.push({
        type: "name_similarity",
        description: "名称弱相似",
        weight: 0.6,
      })
    }
    return reasons
  }

  /**
   * 计算两个字符串的相似度 (0-100)
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0
    if (str1 === str2) return 100

    // 标准化处理
    const normalized1 = this.deepNormalize(str1)
    const normalized2 = this.deepNormalize(str2)

    if (normalized1 === normalized2) return 100

    // 计算Levenshtein距离
    const distance = this.levenshteinDistance(normalized1, normalized2)
    const maxLength = Math.max(normalized1.length, normalized2.length)

    if (maxLength === 0) return 100

    // 转换为相似度百分比
    const similarity = ((maxLength - distance) / maxLength) * 100
    return Math.max(0, similarity)
  }

  /**
   * 计算Levenshtein距离
   */
  levenshteinDistance(str1, str2) {
    const matrix = []

    // 初始化矩阵
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    // 填充矩阵
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // 替换
            matrix[i][j - 1] + 1, // 插入
            matrix[i - 1][j] + 1 // 删除
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }
}

const matchingEngine = new AggressiveMatchingEngine()

/**
 * 检查产品绑定冲突 - 更宽松的检查
 */
async function hasProductBindingConflict(productId, taskId, originalName) {
  try {
    const normalizedCurrent = matchingEngine.deepNormalize(originalName || "")

    // 1. 任务内唯一性检查（更严格 - 同一任务内不允许重复）
    const existingInTask = await MatchingRecord.findOne({
      taskId,
      status: "confirmed",
      "selectedMatch.productId": productId,
    }).lean()

    if (existingInTask) {
      const existingName = matchingEngine.deepNormalize(
        existingInTask.originalData?.name || ""
      )
      // 如果是完全相同的名称，允许（可能是重复数据）
      if (existingName === normalizedCurrent) return false
      return true
    }

    // 2. 全局冲突检查 - 大幅放宽条件
    const latestGlobal = await MatchingRecord.findOne({
      status: "confirmed",
      "selectedMatch.productId": productId,
    })
      .sort({ updatedAt: -1 })
      .lean()

    if (latestGlobal?.originalData?.name) {
      const normalizedLatest = matchingEngine.deepNormalize(
        latestGlobal.originalData.name
      )

      // 更宽松的冲突判断：只有差异很大且没有包含关系才算冲突
      if (normalizedLatest && normalizedCurrent) {
        // 如果两个名称有包含关系或相似度很高，不算冲突
        if (
          normalizedLatest.includes(normalizedCurrent) ||
          normalizedCurrent.includes(normalizedLatest)
        ) {
          return false
        }

        // 计算相似度，如果相似度>60%，不算冲突
        const similarity = matchingEngine.calculateSimilarity(
          normalizedLatest,
          normalizedCurrent
        )
        if (similarity > 60) return false

        // 只有完全不同且相似度很低才算真正冲突
        return similarity < 30
      }
    }

    return false
  } catch (e) {
    return false
  }
}

/**
 * 创建匹配任务
 */
const createMatchingTask = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BusinessError("请上传文件")
  }

  const {
    templateId,
    threshold = 50, // 大幅降低审核阈值，让更多记录进入人工管理
    autoConfirmThreshold = 95, // 大幅提高自动确认阈值，减少自动确认错误
    description = "",
    priority = "normal",
  } = req.body

  if (!templateId) {
    throw new BusinessError("必须指定商品模板ID")
  }

  const ProductTemplate = require("../models/ProductTemplate")
  const template = await ProductTemplate.findById(templateId)
  if (!template) {
    throw new NotFoundError("商品模板")
  }

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

  logOperation("创建匹配任务", req.user, {
    taskId: task._id,
    filename: task.originalFilename,
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

  await task.start()

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
 * 异步处理匹配任务 - 新算法
 */
async function processMatchingTask(taskId) {
  const task = await MatchingTask.findById(taskId)
  if (!task) return

  try {
    logger.info("开始处理匹配任务", { taskId })

    // 1. 解析文件
    const rawData = await parseUploadedFile(
      task.filePath,
      task.originalFilename
    )
    logger.info("文件解析完成", { taskId, 解析条数: rawData.length })

    // 2. 获取商品库
    const products = await Product.find({
      templateId: task.templateId,
      isActive: true,
    }).lean()

    if (products.length === 0) {
      throw new Error("商品库为空，请先添加商品数据")
    }

    // 3. 设置动态品牌
    const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))]
    matchingEngine.setBrands(brands)
    logger.info("已设置动态品牌", { taskId, brandCount: brands.length })

    // 4. 更新任务进度
    task.progress.totalItems = rawData.length
    await task.updateProgress(task.progress)

    // 5. 执行匹配
    let processedCount = 0
    let autoConfirmedCount = 0

    for (const [index, item] of rawData.entries()) {
      try {
        // 解析价格
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

        // 创建匹配记录
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
            quantity: Number(item.quantity || item.数量 || item["数量"]) || 1,
            unit: item.unit || item.单位 || item["单位"] || "盒",
            supplier: item.supplier || item.供应商 || item["供应商"] || "",
            rawData: item,
          },
          metadata: {
            source: {
              row: index + 2,
              file: task.originalFilename,
            },
          },
        })

        // 执行匹配 - 包含模板ID
        const candidates = await matchingEngine.match(
          record.originalData,
          products,
          {
            ...task.config,
            templateId: task.templateId,
          }
        )

        // 确保候选商品包含完整的商品信息
        record.candidates = candidates.map((candidate) => ({
          ...candidate,
          name:
            candidate.name ||
            products.find(
              (p) => p._id.toString() === candidate.productId.toString()
            )?.name,
          brand:
            candidate.brand ||
            products.find(
              (p) => p._id.toString() === candidate.productId.toString()
            )?.brand,
        }))
        await record.save()

        // 自动确认逻辑 - 更激进
        if (candidates.length > 0) {
          const bestScore = candidates[0].score.total
          const bestCandidate = candidates[0]

          // 检查绑定冲突
          const hasConflict = await hasProductBindingConflict(
            bestCandidate.productId,
            task._id,
            record.originalData.name
          )

          // 更智能的自动确认条件 - 记忆匹配优先
          const isHighTrustMemory =
            bestCandidate.isMemoryMatch &&
            bestCandidate.memorySource?.confirmCount >= 3 // 高信任记忆（确认3次以上）

          const shouldAutoConfirm =
            isHighTrustMemory || // 高信任记忆强制自动确认，忽略冲突
            (!hasConflict &&
              (bestCandidate.isMemoryMatch || // 普通记忆匹配直接确认
                bestScore >= 95 || // 极高分自动确认
                (bestScore >= 90 && candidates[0].confidence === "high"))) // 高分+高置信度

          console.log(`🤖 自动确认判断:`, {
            最佳候选: bestCandidate.isMemoryMatch ? "记忆匹配" : "常规匹配",
            确认次数: bestCandidate.memorySource?.confirmCount || 0,
            是否高信任记忆: isHighTrustMemory,
            是否有冲突: hasConflict,
            最佳分数: bestScore,
            是否自动确认: shouldAutoConfirm,
          })

          if (shouldAutoConfirm) {
            const matchType = bestCandidate.isMemoryMatch ? "memory" : "auto"
            const note = bestCandidate.isMemoryMatch
              ? `记忆匹配自动确认 (${
                  bestCandidate.memorySource?.confirmCount || 0
                }次历史确认)`
              : "系统自动确认"

            record.selectedMatch = {
              productId: bestCandidate.productId,
              name:
                bestCandidate.name ||
                products.find(
                  (p) => p._id.toString() === bestCandidate.productId.toString()
                )?.name,
              brand:
                bestCandidate.brand ||
                products.find(
                  (p) => p._id.toString() === bestCandidate.productId.toString()
                )?.brand,
              confidence: bestScore,
              score: bestScore,
              confirmedBy: task.createdBy,
              confirmedAt: new Date(),
              note: note,
              matchType: matchType,
              isMemoryMatch: bestCandidate.isMemoryMatch || false,
            }
            record.status = "confirmed"
            // 注意：不要手动增加 confirmedItems，通过 updateProgress 自动计算
            autoConfirmedCount++

            await record.save()
            await updateProductWholesalePrice(record, bestCandidate.productId)

            // 注释：自动确认不再学习到记忆库，改为完全手动学习模式
            // 用户需要在确认后手动点击"学习到记忆库"按钮
            logger.info("自动确认完成（未自动学习到记忆库）", {
              recordId: record._id,
              originalName: record.originalData.name,
              productId: bestCandidate.productId,
              matchType: matchType,
              score: bestScore,
              note: "需要手动学习到记忆库",
            })
          } else if (bestScore >= 50) {
            // 降低审核阈值，让更多记录进入人工管理
            record.status = "pending"
            // 注意：不要手动增加 pendingItems，它会自动计算

            // 修复：为待审核状态设置预选匹配，让用户能看到系统推荐
            record.selectedMatch = {
              productId: bestCandidate.productId,
              name:
                bestCandidate.name ||
                products.find(
                  (p) => p._id.toString() === bestCandidate.productId.toString()
                )?.name,
              brand:
                bestCandidate.brand ||
                products.find(
                  (p) => p._id.toString() === bestCandidate.productId.toString()
                )?.brand,
              confidence: bestScore,
              score: bestScore,
              matchType: bestCandidate.isMemoryMatch ? "memory" : "auto",
              isMemoryMatch: bestCandidate.isMemoryMatch || false,
              source: "system_suggestion", // 标记为系统建议，非用户确认
            }

            if (hasConflict) {
              record.exceptions.push({
                type: "duplicate_name",
                message: "该商品已关联其他批发名，需人工确认",
                severity: "low",
                createdAt: new Date(),
              })
            }

            // 注释：高分匹配不再预先学习到记忆库，改为完全手动学习模式
            // 即使是高分匹配，也需要用户手动学习到记忆库
            if (bestScore >= 85 && !hasConflict) {
              logger.info("高分匹配检测到（未自动学习到记忆库）", {
                recordId: record._id,
                originalName: record.originalData.name,
                productId: bestCandidate.productId,
                score: bestScore,
                note: "建议用户手动学习到记忆库",
              })
            }
          } else {
            record.status = "exception"
            record.exceptions.push({
              type: "low_confidence",
              message: `匹配置信度过低 (${bestScore}%)`,
              severity: "medium",
              createdAt: new Date(),
            })
            // 注意：不要手动增加 exceptionItems，通过 updateProgress 自动计算
          }

          if (record.status !== "confirmed") {
            await record.save()
          }
        } else {
          // 无候选项直接标记为异常，不进入审核队列
          record.status = "exception"
          record.exceptions.push({
            type: "no_candidates",
            message: "未找到匹配候选项",
            severity: "high",
            createdAt: new Date(),
          })
          // 注意：不要手动增加 exceptionItems，通过 updateProgress 自动计算
          await record.save()
        }

        processedCount++

        // 实时更新进度 - 每处理一个记录都更新 processedItems
        task.progress.processedItems = processedCount

        // 每处理5个记录或达到重要里程碑时保存进度，确保实时性
        if (
          processedCount % 5 === 0 ||
          processedCount === task.progress.totalItems
        ) {
          await task.updateProgress(task.progress)
          logger.info("实时进度更新", {
            taskId,
            processedCount,
            totalItems: task.progress.totalItems,
            progressPercentage: Math.round(
              (processedCount / task.progress.totalItems) * 100
            ),
          })
        }
      } catch (error) {
        logger.error("处理匹配记录失败", {
          taskId,
          index,
          error: error.message,
        })
        // 注意：不要手动增加 exceptionItems，通过 updateProgress 自动计算
      }
    }

    // 6. 完成任务 - 重新统计所有状态数量，确保数据准确
    const confirmed = await MatchingRecord.countDocuments({
      taskId: task._id,
      status: "confirmed",
    })
    const rejected = await MatchingRecord.countDocuments({
      taskId: task._id,
      status: "rejected",
    })
    const pending = await MatchingRecord.countDocuments({
      taskId: task._id,
      status: "pending",
    })
    const exception = await MatchingRecord.countDocuments({
      taskId: task._id,
      status: "exception",
    })

    // 重新设置进度数据
    task.progress.confirmedItems = confirmed
    task.progress.rejectedItems = rejected
    task.progress.pendingItems = pending
    task.progress.exceptionItems = exception
    // processedItems 应该是所有已处理的记录，包括所有状态
    task.progress.processedItems = confirmed + rejected + pending + exception

    await task.updateProgress(task.progress)

    // 计算统计信息
    const totalProcessed = task.progress.processedItems
    const successfulMatches =
      task.progress.confirmedItems + task.progress.pendingItems
    task.statistics.matchRate =
      totalProcessed > 0
        ? Math.round((successfulMatches / totalProcessed) * 100)
        : 0

    const autoConfirmRate =
      totalProcessed > 0
        ? Math.round((autoConfirmedCount / totalProcessed) * 100)
        : 0

    await task.updateStatistics(task.statistics)

    // 最终进度计算 - 确保数据一致性
    await updateTaskStatusAfterReview(taskId)
    // 重新获取任务数据，因为updateTaskStatusAfterReview可能已经更新了进度
    const updatedTask = await MatchingTask.findById(taskId)

    // 更新任务状态
    if (
      updatedTask.progress.pendingItems > 0 ||
      updatedTask.progress.exceptionItems > 0
    ) {
      updatedTask.status = "review"
      await updatedTask.save()
    } else {
      await updatedTask.complete()
    }

    logger.info("匹配任务完成", {
      taskId,
      totalItems: updatedTask.progress.totalItems,
      confirmedItems: updatedTask.progress.confirmedItems,
      pendingItems: updatedTask.progress.pendingItems,
      exceptionItems: updatedTask.progress.exceptionItems,
      processedItems: updatedTask.progress.processedItems, // 添加正确的处理项数量
      realProgress: Math.round(
        (updatedTask.progress.processedItems /
          updatedTask.progress.totalItems) *
          100
      ), // 真实进度
      matchRate: updatedTask.statistics.matchRate,
      autoConfirmRate,
    })
  } catch (error) {
    logger.error("匹配任务执行失败", { taskId, error: error.message })
    await task.fail(error.message)
  } finally {
    // 清理临时文件
    try {
      if (task?.filePath && fs.existsSync(task.filePath)) {
        fs.unlinkSync(task.filePath)
      }
    } catch (cleanupError) {
      logger.warn("清理临时文件失败", { error: cleanupError.message })
    }
  }
}

/**
 * 解析上传的文件
 */
async function parseUploadedFile(filePath, filename) {
  const fileExtension = path.extname(filename).toLowerCase()

  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }

  try {
    if (fileExtension === ".xlsx" || fileExtension === ".xls") {
      return parseExcelFile(filePath)
    } else if (fileExtension === ".csv") {
      return parseCSVFile(filePath)
    } else {
      throw new Error("不支持的文件格式")
    }
  } catch (error) {
    logger.error("文件解析失败", { filePath, filename, error: error.message })
    throw error
  }
}

function parseExcelFile(filePath) {
  const workbook = xlsx.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  return xlsx.utils.sheet_to_json(worksheet)
}

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
 * 更新商品的批发价信息
 */
async function updateProductWholesalePrice(record, productId) {
  try {
    const originalPrice = record.originalData.price
    const originalName = record.originalData.name

    if (!originalPrice || originalPrice <= 0) return

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
    })
  } catch (error) {
    logger.error("更新商品批发价失败", {
      recordId: record._id,
      productId,
      error: error.message,
    })
  }
}

// 其他控制器方法保持不变，只导入必要的方法
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

const getMatchingTaskById = asyncHandler(async (req, res) => {
  const { id } = req.params

  const task = await MatchingTask.findById(id)
    .populate("createdBy", "name email")
    .populate("assignedTo.user", "name email")

  if (!task) {
    throw new NotFoundError("匹配任务")
  }

  const recordStats = await MatchingRecord.getMatchingStatistics(id)

  res.json({
    success: true,
    data: {
      task,
      recordStats: recordStats[0] || { total: 0, statusCounts: [] },
    },
  })
})

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
    MatchingRecord.getPendingReviews(
      filters,
      parseInt(limit),
      sortBy,
      parseInt(page)
    ),
    MatchingRecord.countDocuments({
      status: { $in: ["pending", "exception"] },
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

const getAllMatchingRecords = asyncHandler(async (req, res) => {
  const { taskId, page = 1, limit = 20, status } = req.query

  console.log("🔍 getAllMatchingRecords 请求参数:", {
    taskId,
    page,
    limit,
    status,
    query: req.query,
  })

  const filters = {}
  if (taskId) filters.taskId = taskId
  if (status) filters.status = status

  console.log("🔍 数据库查询 filters:", filters)

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

  console.log("🔍 数据库查询结果:", {
    recordsLength: records.length,
    total: total,
    page: parseInt(page),
    limit: parseInt(limit),
    calculatedPages: Math.ceil(total / parseInt(limit)),
  })

  // 验证是否有数据被意外过滤
  const allRecordsForTask = await MatchingRecord.find({
    taskId,
  }).countDocuments()
  console.log("🔍 该taskId下的总记录数:", allRecordsForTask)

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

const reviewMatchingRecord = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { action, productId, note } = req.body

  const record = await MatchingRecord.findById(id)
  if (!record) {
    throw new NotFoundError("匹配记录")
  }

  if (
    !["pending", "confirmed", "rejected", "exception"].includes(record.status)
  ) {
    throw new BusinessError(`记录状态不允许修改，当前状态: ${record.status}`)
  }

  let result

  if (action === "confirm" && productId) {
    // 记录旧的匹配商品ID（如果有）
    const oldProductId = record.selectedMatch?.productId

    result = await record.confirmMatch(productId, req.user._id, note, "manual")
    await updateProductWholesalePrice(record, productId)

    // 获取任务信息以获取templateId
    const MatchingTask = require("../models/MatchingTask")
    const task = await MatchingTask.findById(record.taskId)
    const templateId = task?.templateId

    // 注释：自动学习功能已移除，改为完全手动学习模式
    // 用户需要主动点击"学习到记忆库"按钮才会保存到记忆库
    logger.info("匹配确认成功（未自动学习到记忆库）", {
      recordId: record._id,
      originalName: record.originalData.name,
      productId,
      oldProductId,
      note: "需要手动学习到记忆库",
    })
  } else if (action === "reject") {
    result = await record.rejectMatch(req.user._id, note)

    // 注释：自动更新记忆库功能已移除，拒绝匹配不再自动影响记忆库
    // 记忆库的管理完全由用户手动控制
    logger.info("匹配拒绝成功（未自动更新记忆库）", {
      recordId: record._id,
      originalName: record.originalData.name,
      rejectedProductId: record.selectedMatch?.productId,
      note: "记忆库需手动管理",
    })
  } else if (action === "clear") {
    result = await record.clearMatch(req.user._id, note)
  } else {
    throw new BusinessError("无效的审核操作")
  }

  await record.recordUserBehavior(req.user._id, action, {
    productId,
    note,
    timestamp: new Date(),
  })

  await updateTaskStatusAfterReview(record.taskId)

  logOperation("审核匹配记录", req.user, {
    recordId: record._id,
    action,
    productId,
  })

  const actionMessages = {
    confirm: "确认",
    reject: "拒绝",
    clear: "清空匹配",
  }

  res.json({
    success: true,
    message: `${actionMessages[action] || action}成功`,
    data: { record: result },
  })
})

/**
 * 手动学习匹配记录到记忆库（增强版本）
 */
const learnToMemory = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { note, confidence, qualityScore } = req.body

  const record = await MatchingRecord.findById(id)
  if (!record) {
    throw new NotFoundError("匹配记录")
  }

  if (!record.selectedMatch?.productId) {
    throw new BusinessError("该记录没有匹配的商品，无法学习到记忆库")
  }

  // 获取任务信息以获取templateId
  const MatchingTask = require("../models/MatchingTask")
  const task = await MatchingTask.findById(record.taskId)
  const templateId = task?.templateId

  try {
    const learningResult = await MatchingMemory.learnFromMatch(
      record.originalData.name,
      record.selectedMatch.productId,
      confidence || record.selectedMatch.confidence || 100,
      req.user._id,
      record._id,
      record.taskId,
      templateId,
      {
        source: "manual",
        initialWeight: 2.0, // 手动学习权重较高
        learningMethod: "single_learn",
        learningNote: note || "用户手动学习",
      }
    )

    // 如果用户提供了质量评分，更新质量控制信息
    if (qualityScore && qualityScore >= 1 && qualityScore <= 5) {
      learningResult.metadata.qualityControl.qualityScore = qualityScore
      learningResult.metadata.qualityControl.qualityNotes = note || "用户评分"
      await learningResult.save()
    }

    logOperation("手动学习记忆", req.user, {
      recordId: record._id,
      originalName: record.originalData.name,
      productId: record.selectedMatch.productId,
      taskName: task?.taskName,
      taskIdentifier: task?.taskIdentifier,
      note,
      qualityScore,
    })

    res.json({
      success: true,
      message: "已成功学习到记忆库",
      data: {
        recordId: record._id,
        memoryId: learningResult._id,
        learningInfo: {
          taskName: task?.taskName || "未知任务",
          taskIdentifier: task?.taskIdentifier || "",
          fileName: task?.originalFilename || "",
          learnedAt: new Date(),
          learningMethod: "single_learn",
        },
      },
    })
  } catch (error) {
    logger.error("手动学习记忆失败", {
      recordId: record._id,
      taskName: task?.taskName,
      error: error.message,
    })

    if (error.code === 11000) {
      res.json({
        success: true,
        message: "该匹配已存在于记忆库中，已更新使用统计",
        data: { recordId: record._id },
      })
    } else {
      throw new BusinessError(`学习到记忆库失败: ${error.message}`)
    }
  }
})

/**
 * 批量学习到记忆库（增强版本）
 */
const batchLearnToMemory = asyncHandler(async (req, res) => {
  const { recordIds, note, qualityScore } = req.body

  if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
    throw new BusinessError("请提供要学习的记录ID列表")
  }

  const results = {
    success: [],
    failed: [],
    total: recordIds.length,
    summary: {
      taskGroups: new Map(),
      totalLearned: 0,
      totalUpdated: 0,
    },
  }

  // 分批处理，避免内存压力
  const batchSize = 50
  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batchIds = recordIds.slice(i, i + batchSize)

    // 批量获取记录和任务信息
    const records = await MatchingRecord.find({ _id: { $in: batchIds } })
    const taskIds = [...new Set(records.map((r) => r.taskId))]
    const tasks = await MatchingTask.find({ _id: { $in: taskIds } })
    const taskMap = new Map(tasks.map((t) => [t._id.toString(), t]))

    for (const record of records) {
      try {
        if (!record.selectedMatch?.productId) {
          results.failed.push({
            recordId: record._id,
            error: "没有匹配的商品",
            originalName: record.originalData.name,
          })
          continue
        }

        const task = taskMap.get(record.taskId.toString())
        const templateId = task?.templateId

        const learningResult = await MatchingMemory.learnFromMatch(
          record.originalData.name,
          record.selectedMatch.productId,
          record.selectedMatch.confidence || 100,
          req.user._id,
          record._id,
          record.taskId,
          templateId,
          {
            source: "manual",
            initialWeight: 2.0,
            learningMethod: "batch_learn",
            learningNote: note || "批量学习",
          }
        )

        // 批量学习的质量评分
        if (qualityScore && qualityScore >= 1 && qualityScore <= 5) {
          learningResult.metadata.qualityControl.qualityScore = qualityScore
          learningResult.metadata.qualityControl.qualityNotes = `批量学习: ${
            note || "无备注"
          }`
          await learningResult.save()
        }

        // 统计任务分组
        const taskKey = task?.taskName || "未知任务"
        if (!results.summary.taskGroups.has(taskKey)) {
          results.summary.taskGroups.set(taskKey, {
            taskName: taskKey,
            taskIdentifier: task?.taskIdentifier || "",
            count: 0,
            records: [],
          })
        }

        const taskGroup = results.summary.taskGroups.get(taskKey)
        taskGroup.count++
        taskGroup.records.push({
          recordId: record._id,
          originalName: record.originalData.name,
          productName: record.selectedMatch.productId.name || "未知商品",
        })

        results.success.push({
          recordId: record._id,
          originalName: record.originalData.name,
          taskName: task?.taskName,
          memoryId: learningResult._id,
        })

        results.summary.totalLearned++
      } catch (error) {
        logger.error("批量学习记忆失败", {
          recordId: record._id,
          originalName: record.originalData.name,
          error: error.message,
        })

        if (error.code === 11000) {
          results.success.push({
            recordId: record._id,
            originalName: record.originalData.name,
            note: "已存在于记忆库，已更新使用统计",
          })
          results.summary.totalUpdated++
        } else {
          results.failed.push({
            recordId: record._id,
            originalName: record.originalData.name,
            error: error.message,
          })
        }
      }
    }
  }

  // 转换任务分组为数组
  results.summary.taskGroups = Array.from(results.summary.taskGroups.values())

  logOperation("批量学习记忆", req.user, {
    totalRecords: results.total,
    successCount: results.success.length,
    failedCount: results.failed.length,
    taskGroups: results.summary.taskGroups.length,
    note,
    qualityScore,
  })

  res.json({
    success: true,
    message: `批量学习完成，成功 ${results.success.length} 条，失败 ${results.failed.length} 条`,
    data: {
      ...results,
      summary: {
        ...results.summary,
        taskGroups: results.summary.taskGroups,
      },
    },
  })
})

const updateOriginalName = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { originalName } = req.body

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

  const oldName = record.originalData.name

  record.originalData.name = originalName.trim()
  record.metadata.lastModified = new Date()
  record.metadata.modifiedBy = req.user._id

  await record.save()

  logOperation("修改原始名称", req.user, {
    recordId: record._id,
    taskId: record.taskId,
    oldName: oldName,
    newName: originalName.trim(),
  })

  res.json({
    success: true,
    message: "原始名称更新成功",
    data: { record },
  })
})

const batchReviewMatchingRecords = asyncHandler(async (req, res) => {
  const { recordIds, action, productIds, note } = req.body

  if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
    throw new BusinessError("请提供要审核的记录ID列表")
  }

  if (!["confirm", "reject"].includes(action)) {
    throw new BusinessError("无效的审核操作")
  }

  if (action === "confirm" && (!productIds || !Array.isArray(productIds))) {
    throw new BusinessError("确认操作需要提供对应的产品ID列表")
  }

  const results = {
    success: [],
    failed: [],
    total: recordIds.length,
  }

  for (let i = 0; i < recordIds.length; i++) {
    const recordId = recordIds[i]

    try {
      const record = await MatchingRecord.findById(recordId)

      if (!record) {
        results.failed.push({ recordId, error: "记录不存在" })
        continue
      }

      if (record.status !== "pending" && record.status !== "exception") {
        results.failed.push({ recordId, error: "记录状态不允许审核" })
        continue
      }

      let result
      if (action === "confirm") {
        const productId = productIds[i]
        if (!productId) {
          results.failed.push({ recordId, error: "缺少产品ID" })
          continue
        }

        // 记录旧的匹配商品ID（如果有）
        const oldProductId = record.selectedMatch?.productId

        result = await record.confirmMatch(
          productId,
          req.user._id,
          note || "批量确认",
          "manual"
        )
        await updateProductWholesalePrice(record, productId)

        // 注释：批量确认不再自动学习到记忆库，改为完全手动学习模式
        // 用户需要使用专门的"批量学习到记忆库"功能
        logger.info("批量确认完成（未自动学习到记忆库）", {
          recordId: record._id,
          originalName: record.originalData.name,
          productId: productId,
          oldProductId: oldProductId,
          note: "需要手动学习到记忆库",
        })
      } else {
        result = await record.rejectMatch(req.user._id, note || "批量拒绝")

        // 双向同步：处理记忆库中被拒绝的匹配
        if (record.selectedMatch?.productId) {
          try {
            await MatchingMemory.handleRejectedMatch(
              record.originalData.name,
              record.selectedMatch.productId,
              req.user._id,
              record._id,
              record.taskId
            )
          } catch (memoryError) {
            logger.error("批量拒绝记忆库同步失败", {
              recordId: record._id,
              error: memoryError.message,
            })
            // 不影响主流程，继续执行
          }
        }
      }

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
      logger.error("批量审核单个记录失败", { recordId, error: error.message })
      results.failed.push({ recordId, error: error.message })
    }
  }

  if (results.success.length > 0) {
    const taskIds = await MatchingRecord.find({
      _id: { $in: recordIds },
    }).distinct("taskId")

    for (const taskId of taskIds) {
      await updateTaskStatusAfterReview(taskId)
    }
  }

  logOperation("批量审核匹配记录", req.user, {
    action,
    totalRecords: results.total,
    successCount: results.success.length,
    failedCount: results.failed.length,
  })

  res.json({
    success: true,
    message: `批量${action === "confirm" ? "确认" : "拒绝"}完成`,
    data: results,
  })
})

const deleteMatchingTask = asyncHandler(async (req, res) => {
  const { id } = req.params

  const task = await MatchingTask.findById(id)
  if (!task) {
    throw new NotFoundError("匹配任务")
  }

  if (task.createdBy.toString() !== req.user._id.toString()) {
    throw new BusinessError("无权删除此任务")
  }

  await MatchingRecord.deleteMany({ taskId: id })
  await MatchingTask.findByIdAndDelete(id)

  logOperation("删除匹配任务", req.user, {
    taskId: id,
    filename: task.originalFilename,
  })

  res.json({
    success: true,
    message: "匹配任务删除成功",
  })
})

async function updateTaskStatusAfterReview(taskId) {
  try {
    const task = await MatchingTask.findById(taskId)
    if (!task) return

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
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          exception: {
            $sum: { $cond: [{ $eq: ["$status", "exception"] }, 1, 0] },
          },
        },
      },
    ])

    if (recordStats.length === 0) return

    const stats = recordStats[0]

    task.progress.confirmedItems = stats.confirmed
    task.progress.rejectedItems = stats.rejected
    task.progress.pendingItems = stats.pending
    task.progress.exceptionItems = stats.exception
    task.progress.processedItems = stats.confirmed + stats.rejected // 只计算已处理的记录

    const successfulMatches = stats.confirmed
    const totalProcessed = stats.total
    task.statistics.matchRate =
      totalProcessed > 0
        ? Math.round((successfulMatches / totalProcessed) * 100)
        : 0

    const pendingCount = stats.pending
    if (pendingCount === 0) {
      task.status = "completed"
      task.completedAt = new Date()
    } else {
      task.status = "review"
    }

    await task.save()
  } catch (error) {
    logger.error("更新任务状态失败", { taskId, error: error.message })
  }
}

const updateTaskStatus = asyncHandler(async (req, res) => {
  const { id } = req.params

  const task = await MatchingTask.findById(id)
  if (!task) {
    throw new NotFoundError("匹配任务")
  }

  await updateTaskStatusAfterReview(id)
  const updatedTask = await MatchingTask.findById(id)

  res.json({
    success: true,
    message: "任务状态更新成功",
    data: { task: updatedTask },
  })
})

const exportMatchingResults = asyncHandler(async (req, res) => {
  const { taskId } = req.params
  const { format = "excel", sortBy = "confidence_desc" } = req.query

  const task = await MatchingTask.findById(taskId)
  if (!task) {
    throw new NotFoundError("匹配任务")
  }

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
  const worksheet = workbook.addWorksheet("匹配结果")

  worksheet.columns = [
    { header: "商品名称", key: "matchedName", width: 25 },
    { header: "盒码", key: "boxCode", width: 15 },
    { header: "条码", key: "barcode", width: 15 },
    { header: "公司价", key: "companyPrice", width: 12 },
    { header: "品牌", key: "matchedBrand", width: 15 },
    { header: "批发名", key: "originalName", width: 25 },
    { header: "批发价", key: "originalPrice", width: 12 },
  ]

  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: "FFFFFF" } }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "366EF7" },
  }
  headerRow.alignment = { horizontal: "center" }

  let exportable = records.filter(
    (r) => r.status === "confirmed" && r.selectedMatch?.productId
  )

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

  exportable.forEach((record) => {
    worksheet.addRow({
      matchedName: record.selectedMatch?.productId?.name || "",
      boxCode: record.selectedMatch?.productId?.boxCode || "",
      barcode: record.selectedMatch?.productId?.productCode || "",
      companyPrice:
        record.selectedMatch?.productId?.pricing?.companyPrice ||
        record.selectedMatch?.productId?.pricing?.retailPrice ||
        0,
      matchedBrand: record.selectedMatch?.productId?.brand || "",
      originalName: record.originalData.name || "",
      originalPrice: record.originalData.price || 0,
    })
  })

  worksheet.columns.forEach((column) => {
    column.width = Math.max(column.width || 10, 10)
  })

  const baseFilename = task.originalFilename
    ? path.parse(task.originalFilename).name
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

  await workbook.xlsx.write(res)

  logOperation("导出匹配结果", req.user, {
    taskId,
    recordCount: exportable.length,
    format: "excel",
  })
})

const getMatchedProducts = asyncHandler(async (req, res) => {
  try {
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
        priceGap: originalPrice - companyPrice,
        totalValue: quantity * companyPrice,
      }
    })

    logOperation("查看匹配商品清单", req.user, {
      totalRecords: matchedProducts.length,
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
  learnToMemory,
  batchLearnToMemory,
  hasProductBindingConflict, // 添加冲突检查函数导出
}
