/**
 * 智能匹配算法核心引擎 - 集成记忆功能
 */
const fuzzy = require("fuzzy")
const { logger, logMatching } = require("./logger")
const Product = require("../models/Product")
const MatchingMemory = require("../models/MatchingMemory")
const config = require("../config/env")

class SmartMatchingEngine {
  constructor(options = {}) {
    // 匹配权重配置 - 移除价格权重
    this.weights = {
      name: options.nameWeight || config.MATCHING.weights.name,
      brand: options.brandWeight || config.MATCHING.weights.brand,
      keywords: options.keywordsWeight || config.MATCHING.weights.keywords,
      package: options.packageWeight || config.MATCHING.weights.package,
    }

    // 阈值配置
    this.thresholds = {
      default: options.defaultThreshold || config.MATCHING.defaultThreshold,
      autoConfirm:
        options.autoConfirmThreshold || config.MATCHING.autoConfirmThreshold,
    }

    // 学习率
    this.learningRate = options.learningRate || config.MATCHING.learningRate

    // 品牌关键词映射
    this.brandKeywords = {
      中华: ["中华", "zhonghua", "zh"],
      玉溪: ["玉溪", "yuxi", "yx"],
      云烟: ["云烟", "yunyan", "yy"],
      黄金叶: ["黄金叶", "huangjinye", "hjy"],
      白沙: ["白沙", "baisha", "bs"],
      芙蓉王: ["芙蓉王", "furongwang", "frw"],
      利群: ["利群", "liqun", "lq"],
      苏烟: ["苏烟", "suyan", "sy"],
    }

    // 包装类型关键词
    this.packageKeywords = {
      硬盒: ["硬", "硬盒", "硬包", "hard"],
      软盒: ["软", "软盒", "软包", "soft"],
      条装: ["条", "条装", "整条"],
      盒装: ["盒", "盒装", "单盒"],
      细支: ["细", "细支", "细烟"],
      中支: ["中支", "中号"],
      粗支: ["粗", "粗支"],
      双中支: ["双中支", "双中"],
    }

    // 规格关键词
    this.sizeKeywords = {
      "20支": ["20", "20支", "标准装"],
      "10支": ["10", "10支", "半包"],
      "16支": ["16", "16支"],
      "12支": ["12", "12支"],
    }
  }

  /**
   * 执行智能匹配
   * @param {Array} wholesaleItems 批发商品数据
   * @param {Object} options 匹配选项
   * @returns {Array} 匹配结果
   */
  async match(wholesaleItems, options = {}) {
    try {
      logMatching(options.taskId, "match_start", {
        itemCount: wholesaleItems.length,
      })

      const startTime = Date.now()
      const results = []

      // 获取所有活跃商品档案
      const productArchive = await Product.find({ isActive: true })
        .lean()
        .exec()

      logger.info(
        `开始匹配，批发商品: ${wholesaleItems.length}，档案商品: ${productArchive.length}`
      )

      for (let i = 0; i < wholesaleItems.length; i++) {
        const item = wholesaleItems[i]

        try {
          // 查找候选匹配项
          const candidates = await this.findCandidates(
            item,
            productArchive,
            options
          )

          // 计算匹配分数
          const scoredCandidates = candidates
            .map((candidate) => ({
              product: candidate,
              score: this.calculateSimilarity(item, candidate),
              reasons: this.generateMatchReasons(item, candidate),
            }))
            .sort((a, b) => b.score.total - a.score.total)
            .slice(0, 5) // 取前5个候选

          // 确定置信度和推荐动作
          const bestScore = scoredCandidates[0]?.score.total || 0
          const confidence = this.determineConfidence(bestScore)
          const recommendedAction = this.getRecommendedAction(bestScore)

          results.push({
            originalData: item,
            candidates: scoredCandidates,
            confidence,
            recommendedAction,
            metadata: {
              processingIndex: i + 1,
              totalItems: wholesaleItems.length,
            },
          })

          // 记录进度
          if ((i + 1) % 50 === 0) {
            logger.info(`匹配进度: ${i + 1}/${wholesaleItems.length}`)
          }
        } catch (itemError) {
          logger.error(`处理商品失败: ${item.name}`, itemError)

          results.push({
            originalData: item,
            candidates: [],
            confidence: "low",
            recommendedAction: "manual_review",
            error: itemError.message,
            metadata: {
              processingIndex: i + 1,
              totalItems: wholesaleItems.length,
            },
          })
        }
      }

      const processingTime = Date.now() - startTime

      logMatching(options.taskId, "match_complete", {
        itemCount: wholesaleItems.length,
        processingTime,
        successCount: results.filter((r) => !r.error).length,
      })

      logger.info(`匹配完成，耗时: ${processingTime}ms`)

      return results
    } catch (error) {
      logMatching(options.taskId, "match_error", { error: error.message })
      logger.error("匹配引擎执行失败:", error)
      throw error
    }
  }

  /**
   * 查找候选匹配项
   * @param {Object} wholesaleItem 批发商品
   * @param {Array} productArchive 商品档案
   * @param {Object} options 选项
   * @returns {Array} 候选商品列表
   */
  async findCandidates(wholesaleItem, productArchive, options = {}) {
    const { name } = wholesaleItem
    const candidates = []
    const normalizedName = this.normalizeText(name)

    // 0. 匹配记忆优先策略 - 新增
    if (options.useMemory !== false) {
      const memoryMatches = await this.findMemoryMatches(normalizedName)
      if (memoryMatches.length > 0) {
        logger.info(
          `找到 ${memoryMatches.length} 个记忆匹配项，原始名称: ${name}`
        )

        // 从记忆中获取推荐产品
        const memoryProducts = memoryMatches
          .map((memory) => {
            const product = productArchive.find(
              (p) =>
                p._id.toString() === memory.confirmedProductId._id.toString()
            )
            if (product) {
              // 给记忆匹配的产品添加额外标记和分数加成
              product._memoryScore = memory.trustScore
              product._memorySource = memory
              product._isMemoryMatch = true
            }
            return product
          })
          .filter(Boolean)

        candidates.push(...memoryProducts)
      }
    }

    // 1. 品牌匹配优先策略
    if (options.brandPriority !== false) {
      const detectedBrand = this.extractBrand(name)
      if (detectedBrand) {
        const brandMatches = productArchive.filter((product) =>
          this.isBrandMatch(product.brand, detectedBrand)
        )
        candidates.push(...brandMatches)
      }
    }

    // 2. 关键词匹配
    if (options.keywordMatching !== false) {
      const extractedKeywords = this.extractKeywords(name)
      const keywordMatches = productArchive.filter((product) =>
        this.hasKeywordMatch(product, extractedKeywords)
      )
      candidates.push(...keywordMatches)
    }

    // 3. 模糊名称匹配
    if (options.fuzzyMatching !== false) {
      const fuzzyOptions = {
        extract: (product) => product.name,
        limit: 20,
      }

      const fuzzyResults = fuzzy.filter(name, productArchive, fuzzyOptions)
      const fuzzyMatches = fuzzyResults
        .filter((result) => result.score > 0.3) // 模糊匹配阈值
        .map((result) => result.original)

      candidates.push(...fuzzyMatches)
    }

    // 4. 去重和排序
    const uniqueCandidates = this.removeDuplicates(candidates)

    // 5. 应用过滤条件
    return this.applyFilters(uniqueCandidates, wholesaleItem, options)
  }

  /**
   * 计算相似度分数
   * @param {Object} wholesale 批发商品
   * @param {Object} product 档案商品
   * @returns {Object} 相似度分数对象
   */
  calculateSimilarity(wholesale, product) {
    // 名称相似度
    const nameScore = this.calculateNameSimilarity(wholesale.name, product.name)

    // 品牌匹配度
    const brandScore = this.calculateBrandSimilarity(
      wholesale.name,
      product.brand
    )

    // 关键词匹配度
    const keywordScore = this.calculateKeywordSimilarity(
      wholesale.name,
      product.keywords || []
    )

    // 包装类型匹配度
    const packageScore = this.calculatePackageSimilarity(
      wholesale.name,
      product.specifications?.packageType
    )

    // 计算基础总分
    let total =
      nameScore * this.weights.name +
      brandScore * this.weights.brand +
      keywordScore * this.weights.keywords +
      packageScore * this.weights.package

    // 记忆加成 - 新增
    let memoryBonus = 0
    if (product._isMemoryMatch && product._memoryScore) {
      // 根据记忆可信度给予加成，最高20分
      memoryBonus = Math.min(20, (product._memoryScore / 100) * 20)
      total += memoryBonus

      logger.debug(
        `记忆匹配加成: ${memoryBonus}, 记忆分数: ${product._memoryScore}`
      )
    }

    // 确保总分不超过100
    total = Math.min(100, total)

    return {
      name: Math.round(nameScore * 100) / 100,
      brand: Math.round(brandScore * 100) / 100,
      keywords: Math.round(keywordScore * 100) / 100,
      package: Math.round(packageScore * 100) / 100,
      memoryBonus: Math.round(memoryBonus * 100) / 100,
      total: Math.round(total * 100) / 100,
      isMemoryMatch: product._isMemoryMatch || false,
    }
  }

  /**
   * 计算名称相似度
   */
  calculateNameSimilarity(wholesaleName, productName) {
    if (!wholesaleName || !productName) return 0

    const name1 = this.normalizeText(wholesaleName)
    const name2 = this.normalizeText(productName)

    // 完全匹配
    if (name1 === name2) return 100

    // 包含关系
    if (name1.includes(name2) || name2.includes(name1)) {
      const shorter = Math.min(name1.length, name2.length)
      const longer = Math.max(name1.length, name2.length)
      return (shorter / longer) * 85
    }

    // 编辑距离算法
    const distance = this.levenshteinDistance(name1, name2)
    const maxLength = Math.max(name1.length, name2.length)
    const similarity = (maxLength - distance) / maxLength

    return Math.max(0, similarity * 80)
  }

  /**
   * 计算品牌相似度
   */
  calculateBrandSimilarity(wholesaleName, productBrand) {
    if (!wholesaleName || !productBrand) return 0

    const normalizedName = this.normalizeText(wholesaleName)
    const normalizedBrand = this.normalizeText(productBrand)

    // 直接品牌匹配
    if (normalizedName.includes(normalizedBrand)) return 100

    // 品牌关键词匹配
    const brandKeywords = this.brandKeywords[productBrand] || []
    for (const keyword of brandKeywords) {
      if (normalizedName.includes(this.normalizeText(keyword))) {
        return 95
      }
    }

    return 0
  }

  /**
   * 计算关键词匹配度
   */
  calculateKeywordSimilarity(wholesaleName, productKeywords) {
    if (!wholesaleName || !productKeywords || productKeywords.length === 0)
      return 0

    const normalizedName = this.normalizeText(wholesaleName)
    let matchCount = 0

    for (const keyword of productKeywords) {
      if (normalizedName.includes(this.normalizeText(keyword))) {
        matchCount++
      }
    }

    return (matchCount / productKeywords.length) * 100
  }

  /**
   * 计算包装类型相似度
   */
  calculatePackageSimilarity(wholesaleName, packageType) {
    if (!wholesaleName || !packageType) return 50 // 默认中性分数

    const normalizedName = this.normalizeText(wholesaleName)
    const normalizedPackage = this.normalizeText(packageType)

    // 直接匹配
    if (normalizedName.includes(normalizedPackage)) return 100

    // 包装关键词匹配
    const packageKeywords = this.packageKeywords[packageType] || []
    for (const keyword of packageKeywords) {
      if (normalizedName.includes(this.normalizeText(keyword))) {
        return 90
      }
    }

    return 30
  }

  /**
   * 提取品牌信息
   */
  extractBrand(name) {
    const normalizedName = this.normalizeText(name)

    for (const [brand, keywords] of Object.entries(this.brandKeywords)) {
      for (const keyword of keywords) {
        if (normalizedName.includes(this.normalizeText(keyword))) {
          return brand
        }
      }
    }

    return null
  }

  /**
   * 提取关键词
   */
  extractKeywords(name) {
    const keywords = []
    const normalizedName = this.normalizeText(name)

    // 提取包装类型关键词
    for (const [packageType, packageKeywords] of Object.entries(
      this.packageKeywords
    )) {
      for (const keyword of packageKeywords) {
        if (normalizedName.includes(this.normalizeText(keyword))) {
          keywords.push(packageType)
          break
        }
      }
    }

    // 提取规格关键词
    for (const [size, sizeKeywords] of Object.entries(this.sizeKeywords)) {
      for (const keyword of sizeKeywords) {
        if (normalizedName.includes(this.normalizeText(keyword))) {
          keywords.push(size)
          break
        }
      }
    }

    return keywords
  }

  /**
   * 判断品牌匹配
   */
  isBrandMatch(productBrand, detectedBrand) {
    return productBrand === detectedBrand
  }

  /**
   * 判断关键词匹配
   */
  hasKeywordMatch(product, extractedKeywords) {
    if (!extractedKeywords || extractedKeywords.length === 0) return false

    const productKeywords = [
      ...(product.keywords || []),
      product.specifications?.packageType,
      product.specifications?.size,
    ].filter(Boolean)

    return extractedKeywords.some((keyword) =>
      productKeywords.some((pk) =>
        this.normalizeText(pk).includes(this.normalizeText(keyword))
      )
    )
  }

  /**
   * 去除重复候选项
   */
  removeDuplicates(candidates) {
    const seen = new Set()
    return candidates.filter((candidate) => {
      const id = candidate._id.toString()
      if (seen.has(id)) {
        return false
      }
      seen.add(id)
      return true
    })
  }

  /**
   * 应用过滤条件
   */
  applyFilters(candidates, wholesaleItem, options) {
    let filtered = candidates

    // 价格范围过滤
    if (options.priceValidation !== false && wholesaleItem.price) {
      const priceRange = wholesaleItem.price * 0.3 // 30%的价格容差
      filtered = filtered.filter((product) => {
        const productPrice = product.specifications?.price
        if (!productPrice) return true // 没有价格信息的保留

        return Math.abs(productPrice - wholesaleItem.price) <= priceRange
      })
    }

    return filtered
  }

  /**
   * 确定置信度等级
   */
  determineConfidence(score) {
    if (score >= this.thresholds.autoConfirm) return "high"
    if (score >= this.thresholds.default) return "medium"
    return "low"
  }

  /**
   * 获取推荐操作
   */
  getRecommendedAction(score) {
    if (score >= this.thresholds.autoConfirm) return "auto_confirm"
    if (score >= this.thresholds.default) return "manual_review"
    return "expert_review"
  }

  /**
   * 生成匹配原因
   */
  generateMatchReasons(wholesaleItem, product) {
    const reasons = []
    const score = this.calculateSimilarity(wholesaleItem, product)

    if (score.brand > 80) {
      reasons.push({
        type: "brand_match",
        description: "品牌匹配",
        weight: score.brand,
      })
    }

    if (score.name > 70) {
      reasons.push({
        type: "name_similarity",
        description: "名称相似",
        weight: score.name,
      })
    }

    if (score.keywords > 60) {
      reasons.push({
        type: "keyword_match",
        description: "关键词匹配",
        weight: score.keywords,
      })
    }

    if (score.price > 80) {
      reasons.push({
        type: "price_range",
        description: "价格合理",
        weight: score.price,
      })
    }

    return reasons
  }

  /**
   * 学习用户选择偏好
   */
  async learnFromUserChoice(
    wholesaleItem,
    selectedProduct,
    rejectedProducts,
    userId
  ) {
    try {
      // 更新选中商品的匹配历史
      const confidence = this.calculateSimilarity(
        wholesaleItem,
        selectedProduct
      ).total
      await selectedProduct.addMatchingHistory(
        wholesaleItem.name,
        confidence,
        userId
      )

      // 调整权重（简单的学习算法）
      const selectedScore = this.calculateSimilarity(
        wholesaleItem,
        selectedProduct
      )

      // 根据用户选择调整权重
      if (selectedScore.brand > 80) {
        this.weights.brand = Math.min(
          1,
          this.weights.brand + this.learningRate * 0.1
        )
      }

      if (selectedScore.name > 80) {
        this.weights.name = Math.min(
          1,
          this.weights.name + this.learningRate * 0.1
        )
      }

      logger.info("学习完成，权重已更新", {
        userId,
        wholesaleItem: wholesaleItem.name,
        selectedProduct: selectedProduct.name,
        newWeights: this.weights,
      })
    } catch (error) {
      logger.error("学习过程失败:", error)
    }
  }

  /**
   * 查找匹配记忆
   * @param {String} normalizedName 标准化的批发名
   * @returns {Array} 匹配的记忆列表
   */
  async findMemoryMatches(normalizedName) {
    try {
      // 精确匹配
      const exactMatches = await MatchingMemory.findMatching(normalizedName, {
        limit: 3,
        minConfidence: 80,
      })

      if (exactMatches.length > 0) {
        return exactMatches
      }

      // 模糊匹配 - 查找相似的批发名
      const similarMatches = await MatchingMemory.find({
        status: "active",
        normalizedWholesaleName: {
          $regex: normalizedName.slice(0, -2),
          $options: "i",
        },
      })
        .populate(
          "confirmedProductId",
          "name brand company productCode boxCode pricing"
        )
        .sort({ weight: -1, confirmCount: -1 })
        .limit(5)
        .lean()

      // 过滤相似度较高的记忆
      const filteredMatches = similarMatches.filter((memory) => {
        const similarity = this.calculateStringSimilarity(
          normalizedName,
          memory.normalizedWholesaleName
        )
        return similarity >= 0.7 // 70%以上相似度
      })

      return filteredMatches
    } catch (error) {
      logger.error("查找匹配记忆失败:", error)
      return []
    }
  }

  /**
   * 从匹配结果中学习并保存记忆
   * @param {String} originalName 原始批发名
   * @param {String} productId 确认的商品ID
   * @param {Number} confidence 置信度
   * @param {String} userId 用户ID
   * @param {String} recordId 匹配记录ID
   * @param {String} taskId 任务ID
   */
  async learnFromMatch(
    originalName,
    productId,
    confidence,
    userId,
    recordId,
    taskId
  ) {
    // 完全禁用自动学习功能 - 现在只有手动学习模式
    logger.info("自动学习已禁用，需要手动学习到记忆库", {
      originalName,
      productId,
      confidence,
      userId,
      recordId,
      taskId,
      note: "自动学习功能已被完全禁用",
    })

    // 不执行任何学习操作，直接返回
    return Promise.resolve()
  }

  /**
   * 计算字符串相似度
   * @param {String} str1 字符串1
   * @param {String} str2 字符串2
   * @returns {Number} 相似度 0-1
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0
    if (str1 === str2) return 1

    const distance = this.levenshteinDistance(str1, str2)
    const maxLength = Math.max(str1.length, str2.length)
    return (maxLength - distance) / maxLength
  }

  /**
   * 文本标准化
   */
  normalizeText(text) {
    if (!text) return ""

    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "") // 移除空格
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, "") // 只保留中文、英文、数字
  }

  /**
   * 计算编辑距离
   */
  levenshteinDistance(str1, str2) {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }
}

// 导出文本标准化函数，供其他模块使用
SmartMatchingEngine.normalizeText = function (text) {
  if (!text) return ""
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, "")
}

module.exports = SmartMatchingEngine
