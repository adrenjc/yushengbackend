/**
 * 商品模板管理控制器
 */
const asyncHandler = require("express-async-handler")
const mongoose = require("mongoose")
const ProductTemplate = require("../models/ProductTemplate")
const Product = require("../models/Product")
const MatchingTask = require("../models/MatchingTask")
const {
  BusinessError,
  NotFoundError,
  ValidationError,
} = require("../middleware/error.middleware")
const { logOperation, logger } = require("../utils/logger")

/**
 * 获取模板列表
 */
const getTemplates = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    category,
    isActive,
    sortBy = "updatedAt",
    sortOrder = "desc",
  } = req.query

  // 构建查询条件
  const query = {}

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ]
  }

  if (category) {
    query.category = category
  }

  if (isActive !== undefined) {
    query.isActive = isActive === "true"
  }

  // 计算跳过的记录数
  const skip = (parseInt(page) - 1) * parseInt(limit)

  // 排序处理
  const sort = {}
  sort[sortBy] = sortOrder === "desc" ? -1 : 1

  // 执行查询
  const [templates, total] = await Promise.all([
    ProductTemplate.find(query)
      .populate("createdBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit)),
    ProductTemplate.countDocuments(query),
  ])

  // 更新统计信息
  for (const template of templates) {
    await template.updateStatistics()
  }

  // 记录操作日志
  logOperation("查看模板列表", req.user, {
    query: req.query,
    resultCount: templates.length,
  })

  res.json({
    success: true,
    message: "获取模板列表成功",
    data: {
      templates,
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
 * 获取模板详情
 */
const getTemplateById = asyncHandler(async (req, res) => {
  const { id } = req.params

  const template = await ProductTemplate.findById(id)
    .populate("createdBy", "name email")
    .populate({
      path: "products",
      options: { limit: 10, sort: { updatedAt: -1 } },
    })

  if (!template) {
    throw new NotFoundError("模板")
  }

  // 更新统计信息
  await template.updateStatistics()

  // 记录操作日志
  logOperation("查看模板详情", req.user, { templateId: id })

  res.json({
    success: true,
    message: "获取模板详情成功",
    data: { template },
  })
})

/**
 * 创建模板
 */
const createTemplate = asyncHandler(async (req, res) => {
  const { name, description, category, settings } = req.body

  // 检查模板名称是否已存在
  const existingTemplate = await ProductTemplate.findOne({ name })
  if (existingTemplate) {
    throw new BusinessError("模板名称已存在")
  }

  // 创建模板
  const template = new ProductTemplate({
    name,
    description,
    category,
    settings,
    createdBy: req.user._id,
  })

  await template.save()

  // 记录操作日志
  logOperation("创建模板", req.user, {
    templateId: template._id,
    templateName: template.name,
  })

  logger.info("创建模板成功", {
    templateId: template._id,
    templateName: template.name,
    userId: req.user._id,
  })

  res.status(201).json({
    success: true,
    message: "创建模板成功",
    data: { template },
  })
})

/**
 * 更新模板
 */
const updateTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, description, category, settings, isActive } = req.body

  const template = await ProductTemplate.findById(id)
  if (!template) {
    throw new NotFoundError("模板")
  }

  // 检查是否为默认模板且尝试禁用
  if (template.isDefault && isActive === false) {
    throw new BusinessError("不能禁用默认模板")
  }

  // 检查名称是否冲突
  if (name && name !== template.name) {
    const existingTemplate = await ProductTemplate.findOne({
      name,
      _id: { $ne: id },
    })
    if (existingTemplate) {
      throw new BusinessError("模板名称已存在")
    }
  }

  // 更新字段
  if (name) template.name = name
  if (description !== undefined) template.description = description
  if (category) template.category = category
  if (settings) template.settings = { ...template.settings, ...settings }
  if (isActive !== undefined) template.isActive = isActive

  await template.save()

  // 记录操作日志
  logOperation("更新模板", req.user, {
    templateId: template._id,
    templateName: template.name,
    changes: req.body,
  })

  logger.info("更新模板成功", {
    templateId: template._id,
    templateName: template.name,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "更新模板成功",
    data: { template },
  })
})

/**
 * 删除模板
 */
const deleteTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params

  const template = await ProductTemplate.findById(id)
  if (!template) {
    throw new NotFoundError("模板")
  }

  // 执行删除（会触发pre删除中间件进行检查）
  await template.deleteOne()

  // 记录操作日志
  logOperation("删除模板", req.user, {
    templateId: template._id,
    templateName: template.name,
  })

  logger.info("删除模板成功", {
    templateId: template._id,
    templateName: template.name,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "删除模板成功",
  })
})

/**
 * 复制模板
 */
const copyTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name } = req.body

  if (!name) {
    throw new ValidationError("新模板名称不能为空")
  }

  // 检查新名称是否已存在
  const existingTemplate = await ProductTemplate.findOne({ name })
  if (existingTemplate) {
    throw new BusinessError("模板名称已存在")
  }

  // 复制模板
  const newTemplate = await ProductTemplate.copyTemplate(id, name, req.user._id)

  // 记录操作日志
  logOperation("复制模板", req.user, {
    sourceTemplateId: id,
    newTemplateId: newTemplate._id,
    newTemplateName: newTemplate.name,
  })

  logger.info("复制模板成功", {
    sourceTemplateId: id,
    newTemplateId: newTemplate._id,
    newTemplateName: newTemplate.name,
    userId: req.user._id,
  })

  res.status(201).json({
    success: true,
    message: "复制模板成功",
    data: { template: newTemplate },
  })
})

/**
 * 获取模板统计信息
 */
const getTemplateStats = asyncHandler(async (req, res) => {
  const { id } = req.params

  const template = await ProductTemplate.findById(id)
  if (!template) {
    throw new NotFoundError("模板")
  }

  // 获取详细统计
  const [
    productCount,
    activeTaskCount,
    completedTaskCount,
    recentTasks,
    topBrands,
  ] = await Promise.all([
    Product.countDocuments({ templateId: id }),
    MatchingTask.countDocuments({
      templateId: id,
      status: { $in: ["processing", "review"] },
    }),
    MatchingTask.countDocuments({
      templateId: id,
      status: "completed",
    }),
    MatchingTask.find({ templateId: id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("originalFilename status createdAt"),
    Product.aggregate([
      { $match: { templateId: mongoose.Types.ObjectId(id) } },
      { $group: { _id: "$brand", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ])

  const stats = {
    productCount,
    taskCount: {
      active: activeTaskCount,
      completed: completedTaskCount,
      total: activeTaskCount + completedTaskCount,
    },
    recentTasks,
    topBrands,
    lastUsedAt: template.statistics.lastUsedAt,
  }

  // 记录操作日志
  logOperation("查看模板统计", req.user, { templateId: id })

  res.json({
    success: true,
    message: "获取模板统计成功",
    data: { stats },
  })
})

/**
 * 设置默认模板
 */
const setDefaultTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params

  const template = await ProductTemplate.findById(id)
  if (!template) {
    throw new NotFoundError("模板")
  }

  if (!template.isActive) {
    throw new BusinessError("不能将非激活状态的模板设为默认")
  }

  // 清除原有默认模板
  await ProductTemplate.updateMany({ isDefault: true }, { isDefault: false })

  // 设置新的默认模板
  template.isDefault = true
  await template.save()

  // 记录操作日志
  logOperation("设置默认模板", req.user, {
    templateId: template._id,
    templateName: template.name,
  })

  logger.info("设置默认模板成功", {
    templateId: template._id,
    templateName: template.name,
    userId: req.user._id,
  })

  res.json({
    success: true,
    message: "设置默认模板成功",
    data: { template },
  })
})

/**
 * 获取模板选项（用于选择器）
 */
const getTemplateOptions = asyncHandler(async (req, res) => {
  const templates = await ProductTemplate.find({ isActive: true })
    .select("_id name description category isDefault statistics")
    .populate("createdBy", "name")
    .sort({ isDefault: -1, name: 1 })

  // 记录操作日志
  logOperation("获取模板选项", req.user, { count: templates.length })

  res.json({
    success: true,
    message: "获取模板选项成功",
    data: { templates },
  })
})

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  copyTemplate,
  getTemplateStats,
  getTemplateOptions,
  setDefaultTemplate,
}
