/**
 * 商品模板数据模型
 */
const mongoose = require("mongoose")

const productTemplateSchema = new mongoose.Schema(
  {
    // 基本信息
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    category: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "默认分类",
    },

    // 模板配置
    settings: {
      matchingThresholds: {
        autoConfirm: {
          type: Number,
          default: 65,
          min: 0,
          max: 100,
        },
        manualReview: {
          type: Number,
          default: 40,
          min: 0,
          max: 100,
        },
        expertReview: {
          type: Number,
          default: 15,
          min: 0,
          max: 100,
        },
      },
      priceValidation: {
        type: Boolean,
        default: true,
      },
      allowCrossTemplateSearch: {
        type: Boolean,
        default: false,
      },
    },

    // 统计信息
    statistics: {
      productCount: {
        type: Number,
        default: 0,
      },
      matchingTaskCount: {
        type: Number,
        default: 0,
      },
      lastUsedAt: {
        type: Date,
        default: null,
      },
    },

    // 创建和管理信息
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id
        delete ret._id
        delete ret.__v
        return ret
      },
    },
  }
)

// 索引 (name已在字段定义中设置unique: true，无需重复)
productTemplateSchema.index({ category: 1 })
productTemplateSchema.index({ createdBy: 1 })
productTemplateSchema.index({ isActive: 1 })
productTemplateSchema.index({ createdAt: -1 })

// 虚拟字段：商品数量
productTemplateSchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "templateId",
})

// 中间件：更新统计信息
productTemplateSchema.methods.updateStatistics = async function () {
  const Product = mongoose.model("Product")
  const MatchingTask = mongoose.model("MatchingTask")

  const productCount = await Product.countDocuments({ templateId: this._id })
  const matchingTaskCount = await MatchingTask.countDocuments({
    templateId: this._id,
  })

  this.statistics.productCount = productCount
  this.statistics.matchingTaskCount = matchingTaskCount

  return this.save()
}

// 静态方法：获取默认模板
productTemplateSchema.statics.getDefaultTemplate = async function () {
  let defaultTemplate = await this.findOne({ isDefault: true, isActive: true })

  // 如果没有默认模板，创建一个
  if (!defaultTemplate) {
    defaultTemplate = await this.create({
      name: "默认模板",
      description: "系统默认商品模板",
      category: "系统模板",
      isDefault: true,
      createdBy: new mongoose.Types.ObjectId(), // 系统用户
    })
  }

  return defaultTemplate
}

// 静态方法：复制模板
productTemplateSchema.statics.copyTemplate = async function (
  sourceId,
  newName,
  createdBy
) {
  const sourceTemplate = await this.findById(sourceId)
  if (!sourceTemplate) {
    throw new Error("源模板不存在")
  }

  const newTemplate = new this({
    name: newName,
    description: `复制自: ${sourceTemplate.name}`,
    category: sourceTemplate.category,
    settings: sourceTemplate.settings,
    createdBy: createdBy,
    isDefault: false,
  })

  await newTemplate.save()

  // 复制商品数据
  const Product = mongoose.model("Product")
  const sourceProducts = await Product.find({ templateId: sourceId })

  if (sourceProducts.length > 0) {
    const newProducts = sourceProducts.map((product) => ({
      ...product.toObject(),
      _id: new mongoose.Types.ObjectId(),
      templateId: newTemplate._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    await Product.insertMany(newProducts)
  }

  await newTemplate.updateStatistics()
  return newTemplate
}

// 预删除中间件：检查是否可以删除
productTemplateSchema.pre("deleteOne", { document: true }, async function () {
  // 检查是否为默认模板
  if (this.isDefault) {
    throw new Error("不能删除默认模板")
  }

  // 检查是否有关联的商品
  const Product = mongoose.model("Product")
  const productCount = await Product.countDocuments({ templateId: this._id })

  if (productCount > 0) {
    throw new Error("模板中还有商品，无法删除。请先清空模板或转移商品。")
  }

  // 检查是否有进行中的匹配任务
  const MatchingTask = mongoose.model("MatchingTask")
  const activeTaskCount = await MatchingTask.countDocuments({
    templateId: this._id,
    status: { $in: ["processing", "review"] },
  })

  if (activeTaskCount > 0) {
    throw new Error("模板中有进行中的匹配任务，无法删除")
  }
})

const ProductTemplate = mongoose.model("ProductTemplate", productTemplateSchema)

module.exports = ProductTemplate
