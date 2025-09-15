/**
 * 商品管理控制器 - 支持新字段结构
 */
const mongoose = require("mongoose")
const Product = require("../models/Product")
const ProductTemplate = require("../models/ProductTemplate")
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

/**
 * 获取商品列表
 */
const getProducts = asyncHandler(async (req, res) => {
  // 禁用缓存
  res.set("Cache-Control", "no-cache, no-store, must-revalidate")
  res.set("Pragma", "no-cache")
  res.set("Expires", "0")

  const {
    page = 1,
    limit = 20,
    search = "",
    brand = "",
    company = "",
    productType = "",
    priceCategory = "",
    priceMin,
    priceMax,
    hasPop,
    category = "",
    isActive,
    sort = "updatedAt",
    order = "desc",
    templateId,
    // 批发价相关筛选
    hasWholesalePrice,
    wholesalePriceMin,
    wholesalePriceMax,
  } = req.query

  // 构建查询条件
  const query = {}

  // 模板ID过滤 - 必须指定模板
  if (!templateId) {
    throw new BusinessError("必须指定商品模板")
  }
  query.templateId = templateId

  // 状态过滤 - 默认显示所有商品
  if (isActive !== undefined && isActive !== "all") {
    query.isActive = isActive === "true"
  }

  // 基本筛选
  if (brand) {
    query.brand = new RegExp(brand, "i")
  }

  if (company) {
    query.company = new RegExp(company, "i")
  }

  if (category) {
    query.category = new RegExp(category, "i")
  }

  if (productType) {
    query.productType = productType
  }

  if (priceCategory) {
    query["pricing.priceCategory"] = priceCategory
  }

  // 价格范围筛选
  if (priceMin || priceMax) {
    query["pricing.retailPrice"] = {}
    if (priceMin) query["pricing.retailPrice"].$gte = parseFloat(priceMin)
    if (priceMax) query["pricing.retailPrice"].$lte = parseFloat(priceMax)
  }

  // 爆珠筛选
  if (hasPop !== undefined && hasPop !== "all") {
    if (hasPop === "true") {
      query["features.hasPop"] = true
    } else if (hasPop === "false") {
      query.$and = query.$and || []
      query.$and.push({
        $or: [
          { "features.hasPop": { $exists: false } },
          { "features.hasPop": false },
          { "features.hasPop": null },
        ],
      })
    }
  }

  // 批发价筛选
  if (hasWholesalePrice !== undefined && hasWholesalePrice !== "all") {
    if (hasWholesalePrice === "yes") {
      // 有批发价：批发价字段存在且大于0
      query["wholesale.price"] = { $exists: true, $gt: 0 }
    } else if (hasWholesalePrice === "no") {
      // 没有批发价：批发价字段不存在或为空或为0
      query.$and = query.$and || []
      query.$and.push({
        $or: [
          { "wholesale.price": { $exists: false } },
          { "wholesale.price": null },
          { "wholesale.price": 0 },
          { "wholesale.price": { $lte: 0 } },
        ],
      })
    }
  }

  // 批发价格范围筛选
  if (wholesalePriceMin || wholesalePriceMax) {
    // 保留已有的条件，避免覆盖 hasWholesalePrice 的条件
    const existingCondition = query["wholesale.price"] || {}

    if (wholesalePriceMin) {
      existingCondition.$gte = parseFloat(wholesalePriceMin)
    }
    if (wholesalePriceMax) {
      existingCondition.$lte = parseFloat(wholesalePriceMax)
    }

    query["wholesale.price"] = existingCondition
  }

  // 文本搜索
  if (search) {
    query.$or = [
      { name: new RegExp(search, "i") },
      { brand: new RegExp(search, "i") },
      { keywords: { $in: [new RegExp(search, "i")] } },
      { "wholesale.name": new RegExp(search, "i") },
      { productCode: new RegExp(search, "i") },
      { boxCode: new RegExp(search, "i") },
      { company: new RegExp(search, "i") },
    ]
  }

  // 排序配置
  const sortConfig = {}
  sortConfig[sort] = order === "desc" ? -1 : 1

  // 执行查询

  const [products, total] = await Promise.all([
    Product.find(query)
      .sort(sortConfig)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean(),
    Product.countDocuments(query),
  ])

  // 计算分页信息
  const totalPages = Math.ceil(total / parseInt(limit))
  const hasNextPage = parseInt(page) < totalPages
  const hasPrevPage = parseInt(page) > 1

  res.json({
    success: true,
    data: {
      products,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: totalPages,
        hasNext: hasNextPage,
        hasPrev: hasPrevPage,
      },
    },
  })
})

/**
 * 根据ID获取商品详情
 */
const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params

  const product = await Product.findById(id).lean()

  if (!product) {
    throw new NotFoundError("商品")
  }

  res.json({
    success: true,
    data: { product },
  })
})

/**
 * 创建商品
 */
const createProduct = asyncHandler(async (req, res) => {
  const { templateId } = req.body

  // 验证模板是否存在且激活
  if (!templateId) {
    throw new BusinessError("必须指定商品模板")
  }

  const template = await ProductTemplate.findById(templateId)
  if (!template) {
    throw new NotFoundError("商品模板")
  }

  if (!template.isActive) {
    throw new BusinessError("所选模板已被禁用")
  }

  // 准备商品数据
  const productData = {
    ...req.body,
    templateId,
    metadata: {
      ...req.body.metadata,
      lastUpdatedBy: req.user._id,
      source: req.body.metadata?.source || "manual",
    },
  }

  const product = new Product(productData)
  await product.save()

  // 更新模板统计
  await template.updateStatistics()

  // 记录操作日志
  logOperation("创建商品", req.user, {
    productId: product._id,
    productName: product.name,
    brand: product.brand,
  })

  logger.info("商品创建成功", {
    productId: product._id,
    productName: product.name,
    userId: req.user._id,
  })

  res.status(201).json({
    success: true,
    message: "商品创建成功",
    data: { product },
  })
})

/**
 * 更新商品
 */
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  const product = await Product.findById(id)
  if (!product) {
    throw new NotFoundError("商品")
  }

  // 更新商品数据
  Object.assign(product, req.body)
  product.metadata.lastUpdatedBy = req.user._id
  product.updatedAt = new Date()

  await product.save()

  // 记录操作日志
  logOperation("更新商品", req.user, {
    productId: product._id,
    productName: product.name,
    changes: Object.keys(req.body),
  })

  logger.info("商品更新成功", {
    productId: product._id,
    productName: product.name,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "商品更新成功",
    data: { product },
  })
})

/**
 * 删除商品
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  const product = await Product.findById(id)
  if (!product) {
    throw new NotFoundError("商品")
  }

  await product.deleteOne()

  // 更新模板统计
  const template = await ProductTemplate.findById(product.templateId)
  if (template) {
    await template.updateStatistics()
  }

  // 记录操作日志
  logOperation("删除商品", req.user, {
    productId: product._id,
    productName: product.name,
  })

  logger.info("商品删除成功", {
    productId: product._id,
    productName: product.name,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "商品删除成功",
  })
})

/**
 * 批量删除商品
 */
const bulkDeleteProducts = asyncHandler(async (req, res) => {
  const { ids, templateId } = req.body

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new BusinessError("请提供要删除的商品ID列表")
  }

  if (!templateId) {
    throw new BusinessError("必须指定模板ID")
  }

  // 验证所有商品都属于指定模板
  const products = await Product.find({
    _id: { $in: ids },
    templateId: templateId,
  })

  if (products.length !== ids.length) {
    throw new BusinessError("部分商品不存在或不属于指定模板")
  }

  // 执行批量删除
  const result = await Product.deleteMany({
    _id: { $in: ids },
    templateId: templateId,
  })

  // 更新模板统计
  const template = await ProductTemplate.findById(templateId)
  if (template) {
    await template.updateStatistics()
  }

  // 记录操作日志
  logOperation("批量删除商品", req.user, {
    templateId,
    deletedCount: result.deletedCount,
    productIds: ids,
  })

  logger.info("批量删除商品成功", {
    templateId,
    deletedCount: result.deletedCount,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: `成功删除 ${result.deletedCount} 个商品`,
    data: { deletedCount: result.deletedCount },
  })
})

/**
 * 获取商品统计信息
 */
const getProductStats = asyncHandler(async (req, res) => {
  const { templateId } = req.query

  if (!templateId) {
    throw new BusinessError("必须指定模板ID")
  }

  const [
    totalCount,
    activeCount,
    brandStats,
    priceDistribution,
    companyStats,
    productTypeStats,
    recentProducts,
  ] = await Promise.all([
    Product.countDocuments({ templateId }),
    Product.countDocuments({ templateId, isActive: true }),
    Product.aggregate([
      {
        $match: {
          templateId: new mongoose.Types.ObjectId(templateId),
          isActive: true,
        },
      },
      { $group: { _id: "$brand", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Product.aggregate([
      {
        $match: {
          templateId: new mongoose.Types.ObjectId(templateId),
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
    ]),
    Product.aggregate([
      {
        $match: {
          templateId: new mongoose.Types.ObjectId(templateId),
          isActive: true,
        },
      },
      { $group: { _id: "$company", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Product.aggregate([
      {
        $match: {
          templateId: new mongoose.Types.ObjectId(templateId),
          isActive: true,
        },
      },
      { $group: { _id: "$productType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Product.find({ templateId, isActive: true })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name brand pricing.retailPrice createdAt")
      .lean(),
  ])

  const stats = {
    overview: {
      total: totalCount,
      active: activeCount,
      inactive: totalCount - activeCount,
    },
    brandStats,
    priceDistribution,
    companyStats,
    productTypeStats,
    recentProducts,
  }

  res.json({
    success: true,
    data: { stats },
  })
})

/**
 * 搜索商品
 */
const searchProducts = asyncHandler(async (req, res) => {
  const { q: query, templateId, limit = 20, page = 1, filters = {} } = req.query

  if (!templateId) {
    throw new BusinessError("必须指定模板ID")
  }

  const searchOptions = {
    ...filters,
    templateId: templateId, // 添加templateId到搜索选项
    limit: parseInt(limit),
    page: parseInt(page),
  }

  const results = await Product.searchProducts(query, searchOptions)

  // 获取已匹配的商品详细信息（在指定模板下）
  const MatchingMemory = require("../models/MatchingMemory")
  const matchedMemories = await MatchingMemory.find({
    templateId: templateId,
    status: "active",
  }).select("confirmedProductId originalName")

  // 创建匹配映射：商品ID -> 原始商品名称
  const matchedProductMap = new Map()
  matchedMemories.forEach((memory) => {
    matchedProductMap.set(
      memory.confirmedProductId.toString(),
      memory.originalName
    )
  })

  const matchedProductIds = matchedMemories.map((m) => m.confirmedProductId)

  // 标记已匹配的商品，并包含匹配详情
  const productsWithMatchStatus = results.map((product) => {
    const productIdStr = product._id.toString()
    const isMatched = matchedProductMap.has(productIdStr)
    const matchedByOriginalName = isMatched
      ? matchedProductMap.get(productIdStr)
      : null

    return {
      ...product,
      isMatched,
      matchedByOriginalName, // 添加匹配的原始商品名称
    }
  })

  res.json({
    success: true,
    data: {
      products: productsWithMatchStatus,
      query,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
      },
      matchedCount: matchedProductIds.length,
    },
  })
})

/**
 * 导入商品数据
 */
const importProducts = asyncHandler(async (req, res) => {
  const { templateId, importType = "csv" } = req.body

  if (!req.file) {
    throw new BusinessError("请上传文件")
  }

  if (!templateId) {
    throw new BusinessError("必须指定商品模板")
  }

  const template = await ProductTemplate.findById(templateId)
  if (!template) {
    throw new NotFoundError("商品模板")
  }

  const filePath = req.file.path
  const results = {
    total: 0,
    success: 0,
    failed: 0,
    errors: [],
  }

  try {
    if (importType === "csv") {
      await importFromCSV(filePath, templateId, results, req.user)
    } else if (importType === "excel") {
      await importFromExcel(filePath, templateId, results, req.user)
    } else {
      throw new BusinessError("不支持的文件格式")
    }

    // 更新模板统计
    await template.updateStatistics()

    // 记录操作日志
    logOperation("导入商品", req.user, {
      templateId,
      filename: req.file.originalname,
      results,
    })

    logger.info("商品导入完成", {
      templateId,
      results,
      userId: req.user._id,
    })

    res.json({
      success: true,
      message: `导入完成：成功 ${results.success} 个，失败 ${results.failed} 个`,
      data: { results },
    })
  } catch (error) {
    logger.error("商品导入失败", { error: error.message, userId: req.user._id })

    // 返回错误响应而不是抛出错误
    res.status(400).json({
      success: false,
      message: `导入失败: ${error.message}`,
      data: { results, error: error.message },
    })
    return
  } finally {
    // 清理上传的文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
})

/**
 * 从Excel导入商品
 */
async function importFromExcel(filePath, templateId, results, user) {
  const XLSX = require("xlsx")

  try {
    // 读取Excel文件
    const workbook = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0] // 使用第一个工作表
    const worksheet = workbook.Sheets[sheetName]

    // 将工作表转换为JSON格式
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    if (jsonData.length === 0) {
      throw new Error("Excel文件为空")
    }

    // 第一行作为表头
    const headers = jsonData[0]
    const products = []

    // 处理数据行（从第二行开始）
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (!row || row.length === 0) continue

      try {
        // 将数组转换为对象
        const rowObject = {}
        headers.forEach((header, index) => {
          if (header && row[index] !== undefined) {
            rowObject[header] = row[index]
          }
        })

        const product = parseCSVRow(rowObject, templateId, user)
        if (product) {
          products.push(product)
        }
        results.total++
      } catch (error) {
        results.failed++
        results.errors.push(`第${i + 1}行: ${error.message}`)
      }
    }

    // 批量插入商品
    if (products.length > 0) {
      try {
        await Product.insertMany(products, { ordered: false })
        results.success = products.length
      } catch (error) {
        if (error.name === "BulkWriteError") {
          results.success = products.length - error.writeErrors.length
          results.failed += error.writeErrors.length
          error.writeErrors.forEach((err) => {
            results.errors.push(`导入错误: ${err.errmsg}`)
          })
        } else {
          throw error
        }
      }
    }
  } catch (error) {
    throw new Error(`Excel文件解析失败: ${error.message}`)
  }
}

/**
 * 从CSV导入商品
 */
async function importFromCSV(filePath, templateId, results, user) {
  return new Promise((resolve, reject) => {
    const products = []

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          const product = parseCSVRow(row, templateId, user)
          if (product) {
            products.push(product)
          }
          results.total++
        } catch (error) {
          results.failed++
          results.errors.push(`第${results.total + 1}行: ${error.message}`)
        }
      })
      .on("end", async () => {
        try {
          if (products.length > 0) {
            await Product.insertMany(products, { ordered: false })
            results.success = products.length
          }
          resolve()
        } catch (error) {
          if (error.name === "BulkWriteError") {
            results.success = products.length - error.writeErrors.length
            results.failed += error.writeErrors.length
            error.writeErrors.forEach((err) => {
              results.errors.push(`导入错误: ${err.errmsg}`)
            })
            resolve()
          } else {
            reject(error)
          }
        }
      })
      .on("error", reject)
  })
}

/**
 * 解析CSV行数据
 */
function parseCSVRow(row, templateId, user) {
  // 基本验证
  if (!row["商品名称"] || !row["品牌"]) {
    throw new Error("商品名称和品牌不能为空")
  }

  return {
    templateId,
    name: row["商品名称"]?.trim(),
    brand: row["品牌"]?.trim(),
    productCode: row["产品编码"]?.trim(),
    boxCode: row["盒码编码"]?.trim(),
    productType: row["产品类型"]?.trim(),
    packageType: row["包装类型"]?.trim(),

    specifications: {
      circumference: parseFloat(row["烟支周长(mm)"]) || undefined,
      length: row["烟支长度"]?.trim(),
      packageQuantity: parseFloat(row["包装数量"]) || undefined,
    },

    launchDate: parseDate(row["上市时间"]),

    chemicalContent: {
      tarContent: parseFloat(row["焦油含量(mg)"]) || undefined,
      nicotineContent: parseFloat(row["烟气烟碱量(mg)"]) || undefined,
      carbonMonoxideContent: parseFloat(row["烟气一氧化碳量(mg)"]) || undefined,
    },

    appearance: {
      color: row["颜色"]?.trim(),
    },

    company: row["所属企业"]?.trim(),

    features: {
      hasPop: parseBooleanFromChinese(row["是否爆珠"]),
    },

    pricing: {
      priceCategory: row["价格类型"]?.trim(),
      companyPrice: parseFloat(row["公司价"]) || undefined, // 新增公司价字段
      retailPrice: parseFloat(row["零售价"]) || undefined,
      unit: row["单位"]?.trim() || "元/条",
    },

    metadata: {
      source: "import",
      importBatch: new Date().toISOString().split("T")[0],
      lastUpdatedBy: user._id,
    },
  }
}

/**
 * 解析日期
 */
function parseDate(dateStr) {
  if (!dateStr) return undefined
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? undefined : date
}

/**
 * 解析中文布尔值
 */
function parseBooleanFromChinese(value) {
  if (!value) return false
  const str = value.toString().trim()
  return str === "是" || str === "true" || str === "1"
}

/**
 * 获取品牌列表
 */
const getBrands = asyncHandler(async (req, res) => {
  const { templateId } = req.query

  if (!templateId) {
    throw new BusinessError("必须指定模板ID")
  }

  const brands = await Product.distinct("brand", {
    templateId: mongoose.Types.ObjectId(templateId),
    isActive: true,
  })

  res.json({
    success: true,
    data: { brands: brands.filter(Boolean).sort() },
  })
})

/**
 * 获取分类列表
 */
const getCategories = asyncHandler(async (req, res) => {
  const { templateId } = req.query

  if (!templateId) {
    throw new BusinessError("必须指定模板ID")
  }

  const categories = await Product.distinct("category", {
    templateId: mongoose.Types.ObjectId(templateId),
    isActive: true,
  })

  res.json({
    success: true,
    data: { categories: categories.filter(Boolean).sort() },
  })
})

/**
 * 获取所有商品ID列表
 */
const getAllProductIds = asyncHandler(async (req, res) => {
  const {
    templateId,
    search = "",
    brand = "",
    company = "",
    productType = "",
    priceCategory = "",
    priceMin,
    priceMax,
    hasPop,
    category = "",
    isActive,
    // 批发价相关筛选
    hasWholesalePrice,
    wholesalePriceMin,
    wholesalePriceMax,
  } = req.query

  if (!templateId) {
    throw new BusinessError("必须指定模板ID")
  }

  // 构建查询条件 - 与getProducts保持完全一致
  const query = { templateId }

  // 状态过滤 - 默认显示所有商品
  if (isActive !== undefined && isActive !== "all") {
    query.isActive = isActive === "true"
  }

  // 基本筛选
  if (brand) {
    query.brand = new RegExp(brand, "i")
  }

  if (company) {
    query.company = new RegExp(company, "i")
  }

  if (category) {
    query.category = new RegExp(category, "i")
  }

  if (productType) {
    query.productType = productType
  }

  if (priceCategory) {
    query["pricing.priceCategory"] = priceCategory
  }

  // 价格范围筛选
  if (priceMin || priceMax) {
    query["pricing.retailPrice"] = {}
    if (priceMin) query["pricing.retailPrice"].$gte = parseFloat(priceMin)
    if (priceMax) query["pricing.retailPrice"].$lte = parseFloat(priceMax)
  }

  // 爆珠筛选
  if (hasPop !== undefined && hasPop !== "all") {
    if (hasPop === "true") {
      query["features.hasPop"] = true
    } else if (hasPop === "false") {
      query.$and = query.$and || []
      query.$and.push({
        $or: [
          { "features.hasPop": { $exists: false } },
          { "features.hasPop": false },
          { "features.hasPop": null },
        ],
      })
    }
  }

  // 批发价筛选
  if (hasWholesalePrice !== undefined && hasWholesalePrice !== "all") {
    if (hasWholesalePrice === "yes") {
      // 有批发价：批发价字段存在且大于0
      query["wholesale.price"] = { $exists: true, $gt: 0 }
    } else if (hasWholesalePrice === "no") {
      // 没有批发价：批发价字段不存在或为空或为0
      query.$and = query.$and || []
      query.$and.push({
        $or: [
          { "wholesale.price": { $exists: false } },
          { "wholesale.price": null },
          { "wholesale.price": 0 },
          { "wholesale.price": { $lte: 0 } },
        ],
      })
    }
  }

  // 批发价格范围筛选
  if (wholesalePriceMin || wholesalePriceMax) {
    // 保留已有的条件，避免覆盖 hasWholesalePrice 的条件
    const existingCondition = query["wholesale.price"] || {}

    if (wholesalePriceMin) {
      existingCondition.$gte = parseFloat(wholesalePriceMin)
    }
    if (wholesalePriceMax) {
      existingCondition.$lte = parseFloat(wholesalePriceMax)
    }

    query["wholesale.price"] = existingCondition
  }

  // 文本搜索
  if (search) {
    query.$or = [
      { name: new RegExp(search, "i") },
      { brand: new RegExp(search, "i") },
      { keywords: { $in: [new RegExp(search, "i")] } },
      { "wholesale.name": new RegExp(search, "i") },
      { productCode: new RegExp(search, "i") },
      { boxCode: new RegExp(search, "i") },
      { company: new RegExp(search, "i") },
    ]
  }

  const ids = await Product.find(query).select("_id").lean()

  res.json({
    success: true,
    data: { ids: ids.map((item) => item._id) },
  })
})

/**
 * 导出商品数据
 */
const exportProducts = asyncHandler(async (req, res) => {
  const { format = "json", templateId, brand, category, isActive } = req.query

  if (!templateId) {
    throw new BusinessError("必须指定模板ID")
  }

  const query = { templateId }
  if (brand) query.brand = new RegExp(brand, "i")
  if (category) query.category = new RegExp(category, "i")
  if (isActive !== undefined) query.isActive = isActive === "true"

  const products = await Product.find(query).lean()

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", "attachment; filename=products.csv")

    // 简单的CSV导出实现
    const headers = [
      "商品名称",
      "品牌",
      "产品编码",
      "盒码编码",
      "零售价",
      "企业",
    ]
    const csvData = [
      headers.join(","),
      ...products.map((product) =>
        [
          product.name,
          product.brand,
          product.productCode || "",
          product.boxCode || "",
          product.pricing?.retailPrice || "",
          product.company || "",
        ].join(",")
      ),
    ].join("\n")

    res.send(csvData)
  } else {
    res.json({
      success: true,
      data: { products },
    })
  }
})

/**
 * 上传商品文件
 */
const uploadProducts = asyncHandler(async (req, res) => {
  // 重用现有的importProducts逻辑
  await importProducts(req, res)
})

/**
 * 硬删除商品
 */
const hardDeleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  const product = await Product.findById(id)
  if (!product) {
    throw new NotFoundError("商品")
  }

  await Product.findByIdAndDelete(id)

  // 更新模板统计
  const template = await ProductTemplate.findById(product.templateId)
  if (template) {
    await template.updateStatistics()
  }

  logOperation("硬删除商品", req.user, {
    productId: id,
    productName: product.name,
  })

  res.json({
    success: true,
    message: "商品已永久删除",
  })
})

/**
 * 批量硬删除商品
 */
const hardDeleteProducts = asyncHandler(async (req, res) => {
  const { ids, templateId } = req.body

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new BusinessError("请提供要删除的商品ID列表")
  }

  const result = await Product.deleteMany({
    _id: { $in: ids },
    templateId: templateId,
  })

  if (templateId) {
    const template = await ProductTemplate.findById(templateId)
    if (template) {
      await template.updateStatistics()
    }
  }

  logOperation("批量硬删除商品", req.user, {
    templateId,
    deletedCount: result.deletedCount,
  })

  res.json({
    success: true,
    message: `成功删除 ${result.deletedCount} 个商品`,
    data: { deletedCount: result.deletedCount },
  })
})

/**
 * 更新商品状态
 */
const updateProductStatus = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { isActive } = req.body

  if (typeof isActive !== "boolean") {
    throw new BusinessError("状态值必须是布尔类型")
  }

  const product = await Product.findById(id)
  if (!product) {
    throw new NotFoundError("商品不存在")
  }

  product.isActive = isActive
  await product.save()

  // 更新模板统计
  if (product.templateId) {
    const template = await ProductTemplate.findById(product.templateId)
    if (template) {
      await template.updateStatistics()
    }
  }

  logOperation("更新商品状态", req.user, {
    productId: id,
    isActive,
    productName: product.basicInfo?.name || "未知商品",
  })

  res.json({
    success: true,
    message: `商品已${isActive ? "启用" : "禁用"}`,
    data: {
      productId: id,
      isActive,
      product: product,
    },
  })
})

/**
 * 批量操作
 */
const batchOperation = asyncHandler(async (req, res) => {
  const { operation, productIds, templateId, data } = req.body

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    throw new BusinessError("请提供商品ID列表")
  }

  let result

  switch (operation) {
    case "delete":
      result = await Product.updateMany(
        { _id: { $in: productIds }, templateId },
        { isActive: false }
      )
      break
    case "activate":
      result = await Product.updateMany(
        { _id: { $in: productIds }, templateId },
        { isActive: true }
      )
      break
    case "deactivate":
      result = await Product.updateMany(
        { _id: { $in: productIds }, templateId },
        { isActive: false }
      )
      break
    case "updateCategory":
      if (!data?.category) {
        throw new BusinessError("请提供分类信息")
      }
      result = await Product.updateMany(
        { _id: { $in: productIds }, templateId },
        { category: data.category }
      )
      break
    default:
      throw new BusinessError("不支持的批量操作")
  }

  logOperation(`批量操作-${operation}`, req.user, {
    templateId,
    affectedCount: result.modifiedCount,
    productIds,
  })

  res.json({
    success: true,
    message: `批量操作完成，影响 ${result.modifiedCount} 个商品`,
    data: { affectedCount: result.modifiedCount },
  })
})

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
  deleteProduct,
  hardDeleteProduct,
  hardDeleteProducts,
  bulkDeleteProducts,
  batchOperation,
  getProductStats,
  searchProducts,
  getBrands,
  getCategories,
  getAllProductIds,
  importProducts,
  exportProducts,
  uploadProducts,
}
