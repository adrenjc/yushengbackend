/**
 * 数据库初始化脚本
 * 创建默认模板和系统用户
 */
const mongoose = require("mongoose")
const ProductTemplate = require("../src/models/ProductTemplate")
const User = require("../src/models/User")
const config = require("../src/config/env")

async function initDatabase() {
  try {
    console.log("🔄 连接数据库...")
    await mongoose.connect(config.MONGODB_URI)
    console.log("✅ 数据库连接成功")

    // 创建系统用户（如果不存在）
    let systemUser = await User.findOne({ username: "system" })
    if (!systemUser) {
      systemUser = new User({
        username: "system",
        name: "系统用户",
        password: "system123", // 这会被加密
        role: "admin",
        department: "系统",
        position: "系统管理员",
      })
      await systemUser.save()
      console.log("✅ 系统用户创建成功")
    } else {
      console.log("ℹ️ 系统用户已存在")
    }

    // 创建默认模板（如果不存在）
    let defaultTemplate = await ProductTemplate.findOne({ isDefault: true })
    if (!defaultTemplate) {
      defaultTemplate = new ProductTemplate({
        name: "默认商品模板",
        description: "系统默认的商品管理模板，包含基础的商品信息管理功能",
        category: "系统模板",
        settings: {
          matchingThresholds: {
            autoConfirm: 65,
            manualReview: 40,
            expertReview: 15,
          },
          priceValidation: true,
          allowCrossTemplateSearch: false,
        },
        createdBy: systemUser._id,
        isDefault: true,
        isActive: true,
      })
      await defaultTemplate.save()
      console.log("✅ 默认模板创建成功")
    } else {
      console.log("ℹ️ 默认模板已存在")
    }

    // 创建示例模板
    const exampleTemplate = await ProductTemplate.findOne({
      name: "卷烟商品模板",
    })
    if (!exampleTemplate) {
      const cigaretteTemplate = new ProductTemplate({
        name: "卷烟商品模板",
        description:
          "专门用于管理卷烟类商品的模板，包含卷烟特有的属性和匹配规则",
        category: "行业模板",
        settings: {
          matchingThresholds: {
            autoConfirm: 70, // 卷烟匹配要求更高精度
            manualReview: 45,
            expertReview: 20,
          },
          priceValidation: true,
          allowCrossTemplateSearch: true,
        },
        createdBy: systemUser._id,
        isDefault: false,
        isActive: true,
      })
      await cigaretteTemplate.save()
      console.log("✅ 卷烟模板创建成功")
    } else {
      console.log("ℹ️ 卷烟模板已存在")
    }

    console.log("\n🎉 数据库初始化完成！")
    console.log("📊 创建的模板:")
    const templates = await ProductTemplate.find().populate("createdBy", "name")
    templates.forEach((template) => {
      console.log(
        `  - ${template.name} (${template.isDefault ? "默认" : "普通"})`
      )
    })
  } catch (error) {
    console.error("❌ 数据库初始化失败:", error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log("🔌 数据库连接已关闭")
    process.exit(0)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log("🚀 开始初始化数据库...")
  initDatabase()
}

module.exports = initDatabase
