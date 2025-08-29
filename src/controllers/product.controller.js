/**
 * 商品管理控制器
 */
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
  const {
    page = 1,
    limit = 20,
    search = "",
    brand = "",
    category = "",
    isActive,
    sort = "updatedAt",
    order = "desc",
    templateId,
  } = req.query

  // 构建查询条件
  const query = {}

  // 模板ID过滤 - 必须指定模板
  if (!templateId) {
    throw new BusinessError("必须指定商品模板")
  }
  query.templateId = templateId

  // 默认仅返回启用商品；只有当显式传入 isActive 时才按传值过滤
  if (isActive === undefined) {
    query.isActive = true
  } else {
    query.isActive = isActive === "true"
  }

  if (brand) {
    query.brand = new RegExp(brand, "i")
  }

  if (category) {
    query.category = new RegExp(category, "i")
  }

  // 文本搜索
  if (search) {
    query.$or = [
      { name: new RegExp(search, "i") },
      { brand: new RegExp(search, "i") },
      { keywords: { $in: [new RegExp(search, "i")] } },
      { wholesaleName: new RegExp(search, "i") },
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

  const productData = {
    ...req.body,
    templateId,
    "metadata.lastUpdatedBy": req.user._id,
    "metadata.source": "manual",
  }

  const product = new Product(productData)
  await product.save()

  // 更新模板统计
  await template.updateStatistics()

  // 记录操作日志
  logOperation("创建商品", req.user, {
    productId: product._id,
    productName: product.name,
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
  const updateData = {
    ...req.body,
    "metadata.lastUpdatedBy": req.user._id,
    updatedAt: new Date(),
  }

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  )

  if (!product) {
    throw new NotFoundError("商品")
  }

  // 记录操作日志
  logOperation("更新商品", req.user, {
    productId: product._id,
    productName: product.name,
    changes: req.body,
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

  // 软删除：设置为不活跃
  product.isActive = false
  product.metadata.lastUpdatedBy = req.user._id
  await product.save()

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
 * 批量操作商品
 */
const batchOperation = asyncHandler(async (req, res) => {
  const { ids, action, note } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new BusinessError("商品ID列表不能为空")
  }

  let updateData = {
    "metadata.lastUpdatedBy": req.user._id,
    updatedAt: new Date(),
  }

  switch (action) {
    case "activate":
      updateData.isActive = true
      break
    case "deactivate":
      updateData.isActive = false
      break
    case "delete":
      updateData.isActive = false
      break
    default:
      throw new BusinessError("不支持的操作类型")
  }

  const result = await Product.updateMany(
    { _id: { $in: ids } },
    { $set: updateData }
  )

  // 记录操作日志
  logOperation(`批量${action}商品`, req.user, {
    productIds: ids,
    affectedCount: result.modifiedCount,
    note,
  })

  logger.info("批量操作完成", {
    action,
    productIds: ids,
    affectedCount: result.modifiedCount,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: `批量${action}完成`,
    data: {
      affectedCount: result.modifiedCount,
      requestedCount: ids.length,
    },
  })
})

/**
 * 搜索商品
 */
const searchProducts = asyncHandler(async (req, res) => {
  const {
    q: query,
    limit = 20,
    brand,
    category,
    priceMin,
    priceMax,
  } = req.query

  if (!query) {
    throw new BusinessError("搜索关键词不能为空")
  }

  // 使用商品模型的静态搜索方法
  const products = await Product.searchProducts(query, {
    brand,
    category,
    priceMin: priceMin ? parseFloat(priceMin) : undefined,
    priceMax: priceMax ? parseFloat(priceMax) : undefined,
    limit: parseInt(limit),
  })

  res.json({
    success: true,
    data: {
      products,
      query,
      count: products.length,
    },
  })
})

/**
 * 获取商品统计信息
 */
const getProductStats = asyncHandler(async (req, res) => {
  const stats = await Product.aggregate([
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        activeProducts: {
          $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
        },
        inactiveProducts: {
          $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] },
        },
        avgPrice: {
          $avg: "$specifications.price",
        },
        uniqueBrands: { $addToSet: "$brand" },
        uniqueCategories: { $addToSet: "$category" },
      },
    },
    {
      $project: {
        _id: 0,
        totalProducts: 1,
        activeProducts: 1,
        inactiveProducts: 1,
        avgPrice: { $round: ["$avgPrice", 2] },
        brandCount: { $size: "$uniqueBrands" },
        categoryCount: { $size: "$uniqueCategories" },
      },
    },
  ])

  // 获取品牌分布
  const brandStats = await Product.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$brand",
        count: { $sum: 1 },
        avgPrice: { $avg: "$specifications.price" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ])

  // 获取分类分布
  const categoryStats = await Product.aggregate([
    { $match: { isActive: true, category: { $ne: null, $ne: "" } } },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ])

  res.json({
    success: true,
    data: {
      overview: stats[0] || {
        totalProducts: 0,
        activeProducts: 0,
        inactiveProducts: 0,
        avgPrice: 0,
        brandCount: 0,
        categoryCount: 0,
      },
      brandDistribution: brandStats,
      categoryDistribution: categoryStats,
    },
  })
})

/**
 * 获取品牌列表
 */
const getBrands = asyncHandler(async (req, res) => {
  const brands = await Product.distinct("brand", { isActive: true })

  res.json({
    success: true,
    data: { brands: brands.filter(Boolean).sort() },
  })
})

/**
 * 获取分类列表
 */
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Product.distinct("category", {
    isActive: true,
    category: { $ne: null, $ne: "" },
  })

  res.json({
    success: true,
    data: { categories: categories.filter(Boolean).sort() },
  })
})

/**
 * 获取所有商品ID列表（用于全选功能）
 */
const getAllProductIds = asyncHandler(async (req, res) => {
  const {
    search = "",
    brand = "",
    category = "",
    isActive,
    templateId,
  } = req.query

  // 构建查询条件（复用现有逻辑）
  const query = {}

  // 模板ID过滤 - 必须指定模板
  if (!templateId) {
    throw new BusinessError("必须指定商品模板")
  }
  query.templateId = templateId

  // 默认仅返回启用商品；只有当显式传入 isActive 时才按传值过滤
  if (isActive === undefined) {
    query.isActive = true
  } else {
    query.isActive = isActive === "true"
  }

  if (brand) {
    query.brand = new RegExp(brand, "i")
  }

  if (category) {
    query.category = new RegExp(category, "i")
  }

  // 文本搜索
  if (search) {
    query.$or = [
      { name: new RegExp(search, "i") },
      { brand: new RegExp(search, "i") },
      { keywords: { $in: [new RegExp(search, "i")] } },
      { wholesaleName: new RegExp(search, "i") },
    ]
  }

  // 只返回ID列表
  const productIds = await Product.find(query).select("_id").lean()
  const ids = productIds.map((product) => product._id.toString())

  res.json({
    success: true,
    data: {
      ids,
      total: ids.length,
    },
  })
})

/**
 * 导入商品（批量创建）
 */
const importProducts = asyncHandler(async (req, res) => {
  const { products } = req.body

  if (!Array.isArray(products) || products.length === 0) {
    throw new BusinessError("商品数据不能为空")
  }

  const results = {
    success: [],
    failed: [],
    duplicates: [],
  }

  for (const productData of products) {
    try {
      // 检查是否重复（根据名称和品牌）
      const existingProduct = await Product.findOne({
        name: productData.name,
        brand: productData.brand,
      })

      if (existingProduct) {
        results.duplicates.push({
          data: productData,
          reason: "商品已存在",
        })
        continue
      }

      // 创建商品
      const product = new Product({
        ...productData,
        "metadata.source": "import",
        "metadata.importBatch": req.body.batchId || new Date().toISOString(),
        "metadata.lastUpdatedBy": req.user._id,
      })

      await product.save()
      results.success.push(product)
    } catch (error) {
      results.failed.push({
        data: productData,
        error: error.message,
      })
    }
  }

  // 记录操作日志
  logOperation("批量导入商品", req.user, {
    totalCount: products.length,
    successCount: results.success.length,
    failedCount: results.failed.length,
    duplicateCount: results.duplicates.length,
  })

  logger.info("商品批量导入完成", {
    totalCount: products.length,
    successCount: results.success.length,
    failedCount: results.failed.length,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "商品导入完成",
    data: {
      summary: {
        total: products.length,
        success: results.success.length,
        failed: results.failed.length,
        duplicates: results.duplicates.length,
      },
      results,
    },
  })
})

/**
 * 导出商品
 */
const exportProducts = asyncHandler(async (req, res) => {
  const { format = "json", ...filters } = req.query

  // 构建查询条件
  const query = {}
  if (filters.brand) query.brand = new RegExp(filters.brand, "i")
  if (filters.category) query.category = new RegExp(filters.category, "i")
  if (filters.isActive !== undefined)
    query.isActive = filters.isActive === "true"

  const products = await Product.find(query).sort({ updatedAt: -1 }).lean()

  // 记录操作日志
  logOperation("导出商品", req.user, {
    count: products.length,
    format,
    filters,
  })

  logger.info("商品导出", {
    count: products.length,
    format,
    userId: req.user._id,
  })

  if (format === "csv") {
    // 设置CSV响应头
    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", "attachment; filename=products.csv")

    // 这里应该转换为CSV格式，简化处理
    const csvData = products
      .map(
        (p) =>
          `"${p.name}","${p.brand}","${p.category || ""}","${
            p.specifications?.price || ""
          }"`
      )
      .join("\n")

    res.send("名称,品牌,分类,价格\n" + csvData)
  } else {
    res.json({
      success: true,
      data: { products },
      meta: {
        count: products.length,
        exportTime: new Date().toISOString(),
      },
    })
  }
})

/**
 * 上传并导入商品文件
 */
const uploadProducts = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BusinessError("请选择要上传的文件")
  }

  // 获取templateId参数
  const { templateId } = req.query
  if (!templateId) {
    throw new BusinessError("必须指定商品模板ID")
  }

  const file = req.file
  const fileExtension = path.extname(file.originalname).toLowerCase()

  let products = []

  try {
    if (fileExtension === ".xlsx" || fileExtension === ".xls") {
      // 解析Excel文件
      products = await parseExcelFile(file.path)
    } else if (fileExtension === ".csv") {
      // 解析CSV文件
      products = await parseCSVFile(file.path)
    } else {
      throw new BusinessError(
        "不支持的文件格式，请上传 .xlsx, .xls 或 .csv 文件"
      )
    }

    // 删除临时文件
    fs.unlinkSync(file.path)

    console.log("解析得到的商品数据:", products)

    if (products.length === 0) {
      throw new BusinessError("文件中没有有效的商品数据")
    }

    // 验证数据格式
    const validProducts = []
    const invalidProducts = []

    for (const [index, product] of products.entries()) {
      console.log(`验证第${index + 1}行数据:`, product)
      const validation = validateProductData(product, index + 2) // +2 因为第一行是标题
      console.log(`验证结果:`, validation)
      if (validation.isValid) {
        validProducts.push(validation.product)
      } else {
        invalidProducts.push({
          row: index + 2,
          data: product,
          errors: validation.errors,
        })
      }
    }

    if (validProducts.length === 0) {
      console.log("所有商品数据验证失败:", invalidProducts)
      return res.status(400).json({
        success: false,
        message: "文件中没有有效的商品数据",
        data: {
          invalidProducts,
          summary: {
            total: products.length,
            valid: 0,
            invalid: invalidProducts.length,
          },
          errors: invalidProducts.map((p) => p.errors).flat(),
        },
      })
    }

    // 使用现有的导入逻辑
    console.log("开始导入有效商品，数量:", validProducts.length)
    const results = await processProductImport(
      validProducts,
      req.user,
      templateId
    )
    console.log("导入结果:", results)

    res.json({
      success: true,
      message: "文件上传并导入完成",
      data: {
        summary: {
          total: products.length,
          valid: validProducts.length,
          invalid: invalidProducts.length,
          successCount: results.success.length,
          failedCount: results.failed.length,
          duplicateCount: results.duplicates.length,
        },
        results,
        invalidProducts:
          invalidProducts.length > 0 ? invalidProducts : undefined,
      },
    })
  } catch (error) {
    // 确保删除临时文件
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
    throw error
  }
})

/**
 * 解析Excel文件
 */
const parseExcelFile = async (filePath) => {
  const workbook = xlsx.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]

  // 转换为JSON，第一行作为标题
  const jsonData = xlsx.utils.sheet_to_json(worksheet)

  return jsonData.map((row) => normalizeProductData(row))
}

/**
 * 解析CSV文件
 */
const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = []

    fs.createReadStream(filePath, { encoding: "utf8" })
      .pipe(csv())
      .on("data", (row) => {
        results.push(normalizeProductData(row))
      })
      .on("end", () => {
        resolve(results)
      })
      .on("error", (error) => {
        reject(new BusinessError(`CSV文件解析失败: ${error.message}`))
      })
  })
}

/**
 * 标准化商品数据
 */
const normalizeProductData = (row) => {
  // 支持中英文字段名 - 根据实际数据格式调整
  const fieldMapping = {
    // 商品名称相关
    商品名: "name",
    商品名称: "name",
    名称: "name",
    name: "name",

    // 品牌相关
    品牌: "brand",
    brand: "brand",

    // 分类相关
    分类: "category",
    类别: "category",
    category: "category",

    // 价格相关
    价格: "price",
    零售价: "price",
    公司价: "companyPrice", // 公司价单独映射
    price: "price",
    companyPrice: "companyPrice",

    // 批发价相关
    批发价: "wholesalePrice",
    wholesale_price: "wholesalePrice",
    wholesalePrice: "wholesalePrice",

    // 库存相关
    库存: "stock",
    stock: "stock",

    // 条码相关
    条码: "barcode",
    盒码: "boxCode", // 盒码和条码分开映射
    barcode: "barcode",
    boxCode: "boxCode",

    // 描述相关
    描述: "description",
    description: "description",

    // 关键词相关
    关键词: "keywords",
    keywords: "keywords",

    // 规格包装相关
    规格: "specifications",
    specifications: "specifications",
    包装: "packageType",
    package_type: "packageType",
    packageType: "packageType",

    // 单位相关
    单位: "unit",
    unit: "unit",
  }

  const normalized = {}

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = fieldMapping[key] || key
    if (value !== undefined && value !== null && value !== "") {
      // 直接映射所有字段，不再跳过条码字段
      normalized[normalizedKey] = value
    }
  }

  return normalized
}

/**
 * 验证商品数据
 */
const validateProductData = (product, row) => {
  const errors = []
  const result = {
    name: "",
    brand: "",
    category: "",
    keywords: [],
    boxCode: "",
    barcode: "",
    companyPrice: null,
    specifications: {
      price: null,
      packageType: "",
      size: "",
      unit: "盒",
    },
    wholesaleName: "",
    wholesalePrice: null,
    tags: [],
  }

  // 必填字段验证
  if (
    !product.name ||
    typeof product.name !== "string" ||
    product.name.trim().length === 0
  ) {
    errors.push(`第${row}行：商品名称不能为空`)
  } else {
    result.name = product.name.trim()
  }

  // 品牌字段处理 - 支持数字转字符串
  if (
    !product.brand ||
    (typeof product.brand !== "string" && typeof product.brand !== "number")
  ) {
    errors.push(`第${row}行：品牌不能为空`)
  } else {
    const brandStr = product.brand.toString().trim()
    if (brandStr.length === 0) {
      errors.push(`第${row}行：品牌不能为空`)
    } else {
      result.brand = brandStr
    }
  }

  // 可选字段处理
  if (product.category) {
    result.category = product.category.toString().trim()
  }

  // 条码和盒码处理
  if (product.boxCode) {
    result.boxCode = product.boxCode.toString().trim()
  }

  if (product.barcode) {
    result.barcode = product.barcode.toString().trim()
  }

  // 公司价处理
  if (product.companyPrice) {
    const companyPrice = parseFloat(product.companyPrice)
    if (isNaN(companyPrice) || companyPrice < 0) {
      errors.push(`第${row}行：公司价格式不正确`)
    } else {
      result.companyPrice = companyPrice
    }
  }

  if (product.price) {
    const price = parseFloat(product.price)
    if (isNaN(price) || price < 0) {
      errors.push(`第${row}行：价格格式不正确`)
    } else {
      result.specifications.price = price
    }
  }

  if (product.wholesalePrice) {
    const wholesalePrice = parseFloat(product.wholesalePrice)
    if (isNaN(wholesalePrice) || wholesalePrice < 0) {
      errors.push(`第${row}行：批发价格式不正确`)
    } else {
      result.wholesalePrice = wholesalePrice
    }
  }

  if (product.keywords) {
    if (typeof product.keywords === "string") {
      result.keywords = product.keywords
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    } else if (Array.isArray(product.keywords)) {
      result.keywords = product.keywords
        .map((k) => k.toString().trim())
        .filter((k) => k.length > 0)
    }
  }

  if (product.packageType) {
    result.specifications.packageType = product.packageType.toString().trim()
  }

  if (product.unit) {
    result.specifications.unit = product.unit.toString().trim()
  }

  if (product.description) {
    result.description = product.description.toString().trim()
  }

  return {
    isValid: errors.length === 0,
    product: result,
    errors,
  }
}

/**
 * 处理商品导入逻辑（复用现有的importProducts逻辑）
 */
const processProductImport = async (products, user, templateId) => {
  const results = {
    success: [],
    failed: [],
    duplicates: [],
  }

  for (const productData of products) {
    try {
      console.log("正在处理商品数据:", productData)

      // 检查是否重复（根据名称和品牌）
      const existingProduct = await Product.findOne({
        name: productData.name,
        brand: productData.brand,
      })

      if (existingProduct) {
        console.log("发现重复商品:", productData.name, productData.brand)
        results.duplicates.push({
          data: productData,
          reason: "商品已存在",
        })
        continue
      }

      // 创建商品
      const product = new Product({
        ...productData,
        templateId, // 设置模板ID
        metadata: {
          source: "import", // 使用有效的enum值
          importBatch: new Date().toISOString(),
          lastUpdatedBy: user._id,
        },
      })

      console.log("准备保存商品:", product)
      await product.save()
      console.log("商品保存成功, ID:", product._id)
      results.success.push(product)
    } catch (error) {
      console.error("保存商品失败:", error.message)
      results.failed.push({
        data: productData,
        error: error.message,
      })
    }
  }

  // 记录操作日志
  logOperation("文件上传导入商品", user, {
    totalCount: products.length,
    successCount: results.success.length,
    failedCount: results.failed.length,
    duplicateCount: results.duplicates.length,
  })

  logger.info("商品文件上传导入完成", {
    totalCount: products.length,
    successCount: results.success.length,
    failedCount: results.failed.length,
    userId: user._id,
  })

  return results
}

/**
 * 物理删除商品（完全从数据库中删除）
 */
const hardDeleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  const product = await Product.findById(id)

  if (!product) {
    throw new NotFoundError("商品")
  }

  // 物理删除：从数据库中完全删除
  await Product.findByIdAndDelete(id)

  // 记录操作日志
  logOperation("物理删除商品", req.user, {
    productId: id,
    productName: product.name,
  })

  logger.info("商品物理删除成功", {
    productId: id,
    productName: product.name,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "商品已永久删除",
  })
})

/**
 * 批量物理删除商品
 */
const hardDeleteProducts = asyncHandler(async (req, res) => {
  const { ids } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new BusinessError("商品ID列表不能为空")
  }

  // 物理删除：从数据库中完全删除
  const result = await Product.deleteMany({ _id: { $in: ids } })

  // 记录操作日志
  logOperation("批量物理删除商品", req.user, {
    productIds: ids,
    deletedCount: result.deletedCount,
  })

  logger.info("批量物理删除完成", {
    productIds: ids,
    deletedCount: result.deletedCount,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: `已永久删除 ${result.deletedCount} 个商品`,
    data: {
      deletedCount: result.deletedCount,
      requestedCount: ids.length,
    },
  })
})

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  hardDeleteProduct,
  hardDeleteProducts,
  batchOperation,
  searchProducts,
  getProductStats,
  getBrands,
  getCategories,
  getAllProductIds,
  importProducts,
  exportProducts,
  uploadProducts,
}
