/**
 * 添加测试商品数据
 */
require("dotenv").config()
const mongoose = require("mongoose")
const Product = require("../src/models/Product")

const testProducts = [
  {
    name: "黄鹤楼(硬盒)",
    brand: "黄鹤楼",
    category: "香烟",
    companyPrice: 15.0,
    boxCode: "6901028300100",
    barcode: "6901028300117",
    keywords: ["黄鹤楼", "硬", "经典"],
    specifications: {
      packageType: "硬盒",
      size: "84mm",
      price: 15.0,
    },
    isActive: true,
  },
  {
    name: "黄鹤楼(1916)",
    brand: "黄鹤楼",
    category: "香烟",
    companyPrice: 17.0,
    boxCode: "6901028301100",
    barcode: "6901028301117",
    keywords: ["黄鹤楼", "1916", "精品"],
    specifications: {
      packageType: "硬盒",
      size: "84mm",
      price: 17.0,
    },
    isActive: true,
  },
  {
    name: "黄鹤楼(硬合家欢)",
    brand: "黄鹤楼",
    category: "香烟",
    companyPrice: 12.0,
    boxCode: "6901028302100",
    barcode: "6901028302117",
    keywords: ["黄鹤楼", "硬", "合家欢"],
    specifications: {
      packageType: "硬盒",
      size: "84mm",
      price: 12.0,
    },
    isActive: true,
  },
  {
    name: "玉溪(硬盒蓝)",
    brand: "玉溪",
    category: "香烟",
    companyPrice: 18.0,
    boxCode: "6901028400100",
    barcode: "6901028400117",
    keywords: ["玉溪", "硬", "蓝", "中支"],
    specifications: {
      packageType: "硬盒",
      size: "74mm",
      price: 18.0,
    },
    isActive: true,
  },
  {
    name: "南京(九五)",
    brand: "南京",
    category: "香烟",
    companyPrice: 22.0,
    boxCode: "6901028500100",
    barcode: "6901028500117",
    keywords: ["南京", "九五", "精品"],
    specifications: {
      packageType: "硬盒",
      size: "84mm",
      price: 22.0,
    },
    isActive: true,
  },
  {
    name: "云烟(软珍品)",
    brand: "云烟",
    category: "香烟",
    companyPrice: 19.5,
    boxCode: "6901028600100",
    barcode: "6901028600117",
    keywords: ["云烟", "软", "珍品"],
    specifications: {
      packageType: "软盒",
      size: "84mm",
      price: 19.5,
    },
    isActive: true,
  },
  {
    name: "中华(软盒)",
    brand: "中华",
    category: "香烟",
    companyPrice: 35.0,
    boxCode: "6901028700100",
    barcode: "6901028700117",
    keywords: ["中华", "软", "高档"],
    specifications: {
      packageType: "软盒",
      size: "84mm",
      price: 35.0,
    },
    isActive: true,
  },
  {
    name: "芙蓉王(硬盒蓝)",
    brand: "芙蓉王",
    category: "香烟",
    companyPrice: 45.0,
    boxCode: "6901028800100",
    barcode: "6901028800117",
    keywords: ["芙蓉王", "硬", "蓝", "沈香", "细支"],
    specifications: {
      packageType: "硬盒",
      size: "74mm",
      price: 45.0,
    },
    isActive: true,
  },
  {
    name: "红金龙(硬盒)",
    brand: "红金龙",
    category: "香烟",
    companyPrice: 8.5,
    boxCode: "6901028900100",
    barcode: "6901028900117",
    keywords: ["红金龙", "硬", "经济型"],
    specifications: {
      packageType: "硬盒",
      size: "84mm",
      price: 8.5,
    },
    isActive: true,
  },
  {
    name: "真龙(硬起源)",
    brand: "真龙",
    category: "香烟",
    companyPrice: 25.0,
    boxCode: "6901029000100",
    barcode: "6901029000117",
    keywords: ["真龙", "硬", "起源"],
    specifications: {
      packageType: "硬盒",
      size: "84mm",
      price: 25.0,
    },
    isActive: true,
  },
]

async function addTestProducts() {
  try {
    // 连接数据库
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/yusheng"
    )
    console.log("✅ 数据库连接成功")

    // 清除现有商品（可选）
    // await Product.deleteMany({})
    // console.log('🗑️ 清除现有商品数据')

    // 添加测试商品
    for (const productData of testProducts) {
      // 检查是否已存在
      const existing = await Product.findOne({ name: productData.name })
      if (!existing) {
        const product = new Product(productData)
        await product.save()
        console.log(`✅ 添加商品: ${productData.name}`)
      } else {
        console.log(`⚠️ 商品已存在: ${productData.name}`)
      }
    }

    console.log(`🎉 测试商品数据添加完成，共 ${testProducts.length} 个商品`)

    // 显示统计
    const total = await Product.countDocuments()
    console.log(`📊 数据库中共有 ${total} 个商品`)
  } catch (error) {
    console.error("❌ 添加测试数据失败:", error)
  } finally {
    await mongoose.connection.close()
    console.log("🔌 数据库连接已关闭")
  }
}

// 执行脚本
if (require.main === module) {
  addTestProducts()
}

module.exports = addTestProducts
