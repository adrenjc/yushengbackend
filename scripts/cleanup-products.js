/**
 * 清空商品数据脚本
 * 用于重新导入新字段结构的商品数据
 */
const mongoose = require("mongoose")
const Product = require("../src/models/Product")
const MatchingTask = require("../src/models/MatchingTask")
const MatchingRecord = require("../src/models/MatchingRecord")
const config = require("../src/config/env")

async function cleanupProducts() {
  try {
    console.log("🔗 连接数据库...")
    await mongoose.connect(config.MONGODB_URI)
    console.log("✅ 数据库连接成功")

    console.log("\n📊 获取清理前统计信息...")
    const productCount = await Product.countDocuments()
    const matchingTaskCount = await MatchingTask.countDocuments()
    const matchingRecordCount = await MatchingRecord.countDocuments()

    console.log(`   - 商品数量: ${productCount}`)
    console.log(`   - 匹配任务数量: ${matchingTaskCount}`)
    console.log(`   - 匹配记录数量: ${matchingRecordCount}`)

    // 确认操作
    if (productCount > 0 || matchingTaskCount > 0 || matchingRecordCount > 0) {
      console.log("\n⚠️  警告: 此操作将删除所有商品相关数据，包括:")
      console.log("   - 所有商品档案")
      console.log("   - 所有匹配任务")
      console.log("   - 所有匹配记录")
      console.log("   - 相关的历史数据")
      console.log("\n请确保已备份重要数据!")

      // 在脚本中添加确认逻辑（生产环境建议手动确认）
      const shouldContinue = process.argv.includes("--confirm")
      if (!shouldContinue) {
        console.log("\n❌ 请使用 --confirm 参数确认清理操作")
        console.log("   例如: node scripts/cleanup-products.js --confirm")
        process.exit(1)
      }
    }

    console.log("\n🧹 开始清理数据...")

    // 1. 删除匹配记录
    console.log("   删除匹配记录...")
    const deletedRecords = await MatchingRecord.deleteMany({})
    console.log(`   ✅ 已删除 ${deletedRecords.deletedCount} 条匹配记录`)

    // 2. 删除匹配任务
    console.log("   删除匹配任务...")
    const deletedTasks = await MatchingTask.deleteMany({})
    console.log(`   ✅ 已删除 ${deletedTasks.deletedCount} 个匹配任务`)

    // 3. 删除商品档案
    console.log("   删除商品档案...")
    const deletedProducts = await Product.deleteMany({})
    console.log(`   ✅ 已删除 ${deletedProducts.deletedCount} 个商品`)

    console.log("\n📊 清理完成统计:")
    console.log(`   - 删除商品: ${deletedProducts.deletedCount}`)
    console.log(`   - 删除匹配任务: ${deletedTasks.deletedCount}`)
    console.log(`   - 删除匹配记录: ${deletedRecords.deletedCount}`)

    console.log("\n✨ 数据清理完成! 现在可以导入新的商品数据了。")
  } catch (error) {
    console.error("❌ 清理数据时出错:", error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log("🔌 已断开数据库连接")
    process.exit(0)
  }
}

// 导出清理函数（支持在其他脚本中调用）
async function cleanupProductsOnly() {
  try {
    const deletedProducts = await Product.deleteMany({})
    console.log(`✅ 已删除 ${deletedProducts.deletedCount} 个商品`)
    return deletedProducts.deletedCount
  } catch (error) {
    console.error("❌ 清理商品数据时出错:", error)
    throw error
  }
}

// 导出清理匹配相关数据的函数
async function cleanupMatchingData() {
  try {
    const deletedRecords = await MatchingRecord.deleteMany({})
    const deletedTasks = await MatchingTask.deleteMany({})
    console.log(`✅ 已删除 ${deletedRecords.deletedCount} 条匹配记录`)
    console.log(`✅ 已删除 ${deletedTasks.deletedCount} 个匹配任务`)
    return {
      records: deletedRecords.deletedCount,
      tasks: deletedTasks.deletedCount,
    }
  } catch (error) {
    console.error("❌ 清理匹配数据时出错:", error)
    throw error
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  cleanupProducts()
}

module.exports = {
  cleanupProducts,
  cleanupProductsOnly,
  cleanupMatchingData,
}

