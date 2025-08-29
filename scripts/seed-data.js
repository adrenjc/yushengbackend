/**
 * 数据库示例数据生成脚本
 */
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")
const User = require("../src/models/User")
const Product = require("../src/models/Product")
const { logger } = require("../src/utils/logger")

// 加载环境配置
require("dotenv").config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
})
require("dotenv").config() // 回退到默认 .env

// 生产环境用户数据（精简版）
const productionUsers = [
  {
    username: "admin",
    password: "admin123",
    name: "系统管理员",
    role: "admin",
    department: "技术部",
    position: "系统管理员",
  },
  {
    username: "superadmin",
    password: "superadmin123",
    name: "超级管理员",
    role: "admin",
    department: "技术部",
    position: "超级管理员",
  },
]

// 开发环境用户数据（完整测试版）
const developmentUsers = [
  {
    username: "admin",
    password: "admin123",
    name: "系统管理员",
    role: "admin",
    department: "技术部",
    position: "系统管理员",
  },
  {
    username: "superadmin",
    password: "superadmin123",
    name: "超级管理员",
    role: "admin",
    department: "技术部",
    position: "超级管理员",
  },
  {
    username: "reviewer",
    password: "reviewer123",
    name: "审核员",
    role: "reviewer",
    department: "业务部",
    position: "高级审核员",
  },
  {
    username: "operator",
    password: "operator123",
    name: "操作员",
    role: "operator",
    department: "业务部",
    position: "数据录入员",
  },
]

// 根据环境选择用户数据
const users =
  process.env.NODE_ENV === "production" ? productionUsers : developmentUsers

// 示例商品数据
const products = [
  {
    name: "中华(硬)",
    brand: "中华",
    keywords: ["硬盒", "经典", "红色"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 65,
      unit: "盒",
    },
    tags: ["热销", "经典"],
  },
  {
    name: "中华(软)",
    brand: "中华",
    keywords: ["软盒", "经典", "蓝色"],
    category: "香烟",
    specifications: {
      packageType: "软盒",
      size: "20支",
      price: 60,
      unit: "盒",
    },
    tags: ["热销"],
  },
  {
    name: "玉溪(硬)",
    brand: "玉溪",
    keywords: ["硬盒", "金色"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 25,
      unit: "盒",
    },
    tags: ["中档"],
  },
  {
    name: "黄金叶(硬)",
    brand: "黄金叶",
    keywords: ["硬盒", "黄色"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 15,
      unit: "盒",
    },
    tags: ["经济"],
  },
  {
    name: "云烟(硬)",
    brand: "云烟",
    keywords: ["硬盒", "绿色"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 20,
      unit: "盒",
    },
    tags: ["中档"],
  },
  {
    name: "白沙(硬)",
    brand: "白沙",
    keywords: ["硬盒", "白色"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 12,
      unit: "盒",
    },
    tags: ["经济"],
  },
  {
    name: "芙蓉王(硬)",
    brand: "芙蓉王",
    keywords: ["硬盒", "蓝色", "高档"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 28,
      unit: "盒",
    },
    tags: ["高档"],
  },
  {
    name: "利群(硬)",
    brand: "利群",
    keywords: ["硬盒", "红色"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 18,
      unit: "盒",
    },
    tags: ["中档"],
  },
  {
    name: "苏烟(硬)",
    brand: "苏烟",
    keywords: ["硬盒", "蓝色"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 35,
      unit: "盒",
    },
    tags: ["高档"],
  },
  {
    name: "中华(细支)",
    brand: "中华",
    keywords: ["细支", "硬盒", "金色"],
    category: "香烟",
    specifications: {
      packageType: "硬盒",
      size: "20支",
      price: 80,
      unit: "盒",
    },
    tags: ["细支", "高档"],
  },
]

/**
 * 连接数据库
 */
async function connectDatabase() {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/smartmatch"
    await mongoose.connect(mongoUri)
    logger.info("数据库连接成功")
  } catch (error) {
    logger.error("数据库连接失败:", error)
    process.exit(1)
  }
}

/**
 * 清理现有数据
 */
async function clearExistingData() {
  try {
    await User.deleteMany({})
    await Product.deleteMany({})
    logger.info("已清理现有数据")
  } catch (error) {
    logger.error("清理数据失败:", error)
    throw error
  }
}

/**
 * 创建示例用户
 */
async function createUsers() {
  try {
    logger.info("正在创建示例用户...")

    const createdUsers = []

    for (const userData of users) {
      const user = new User(userData)
      await user.save()
      createdUsers.push(user)
      logger.info(`创建用户: ${user.username} (${user.role})`)
    }

    logger.info(`成功创建 ${createdUsers.length} 个用户`)
    return createdUsers
  } catch (error) {
    logger.error("创建用户失败:", error)
    throw error
  }
}

/**
 * 创建示例商品
 */
async function createProducts(adminUser) {
  try {
    logger.info("正在创建示例商品...")

    const createdProducts = []

    for (const productData of products) {
      const product = new Product({
        ...productData,
        "metadata.source": "seed",
        "metadata.lastUpdatedBy": adminUser._id,
      })

      await product.save()
      createdProducts.push(product)
      logger.info(`创建商品: ${product.name} - ${product.brand}`)
    }

    logger.info(`成功创建 ${createdProducts.length} 个商品`)
    return createdProducts
  } catch (error) {
    logger.error("创建商品失败:", error)
    throw error
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    const isProduction = process.env.NODE_ENV === "production"
    console.log(`🌱 开始生成${isProduction ? "生产环境" : "开发环境"}数据...`)
    console.log(`🔧 当前环境: ${process.env.NODE_ENV || "development"}`)
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )

    // 连接数据库
    await connectDatabase()

    // 清理现有数据
    await clearExistingData()

    // 创建用户
    const users = await createUsers()
    const adminUser = users.find((user) => user.role === "admin")

    // 不再创建示例商品，保持商品集合为空

    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    console.log(`✅ ${isProduction ? "生产环境" : "开发环境"}数据生成完成！`)
    console.log("")
    console.log("📋 账户信息:")

    if (isProduction) {
      console.log("👤 管理员账户:")
      console.log("   用户名: admin")
      console.log("   密码: YuSheng2024@Admin!")
      console.log("")
      console.log("👤 超级管理员账户:")
      console.log("   用户名: superadmin")
      console.log("   密码: YuSheng2024@SuperAdmin!")
      console.log("")
      console.log("🔒 生产环境账户已创建，请妥善保管密码！")
    } else {
      console.log("👤 管理员账户:")
      console.log("   用户名: admin")
      console.log("   密码: admin123")
      console.log("")
      console.log("👤 超级管理员账户:")
      console.log("   用户名: superadmin")
      console.log("   密码: superadmin123")
      console.log("")
      console.log("👤 审核员账户:")
      console.log("   用户名: reviewer")
      console.log("   密码: reviewer123")
      console.log("")
      console.log("👤 操作员账户:")
      console.log("   用户名: operator")
      console.log("   密码: operator123")
      console.log("")
      console.log("🧪 开发环境测试账户已创建")
    }

    console.log("")
    console.log("📦 已创建用户；未创建任何示例商品（按需导入/新增）")
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )
  } catch (error) {
    logger.error("生成示例数据失败:", error)
    console.error("❌ 示例数据生成失败:", error.message)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    logger.info("数据库连接已关闭")
    process.exit(0)
  }
}

// 运行脚本
if (require.main === module) {
  main()
}

module.exports = { main }
