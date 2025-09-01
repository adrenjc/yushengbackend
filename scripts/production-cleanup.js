/**
 * 生产环境上线前数据清理脚本
 * 
 * 🚨 警告：此脚本将完全清除以下数据：
 * - 所有商品模板和商品数据
 * - 所有匹配任务和匹配记录
 * - 所有上传的文件
 * - 保留用户账户数据
 * 
 * 使用方法：
 * node scripts/production-cleanup.js
 * 
 * 安全确认：
 * 需要输入确认码才能执行清理
 */

const mongoose = require("mongoose")
const fs = require("fs")
const path = require("path")
const readline = require("readline")
const config = require("../src/config/env")

// 导入模型
const Product = require("../src/models/Product")
const ProductTemplate = require("../src/models/ProductTemplate") 
const MatchingTask = require("../src/models/MatchingTask")
const MatchingRecord = require("../src/models/MatchingRecord")

// 生成随机确认码
const CONFIRMATION_CODE = Math.random().toString(36).substring(2, 8).toUpperCase()

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// 询问用户确认
function askConfirmation(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer)
    })
  })
}

// 清理上传文件
async function cleanupUploads() {
  const uploadsDir = path.join(__dirname, "../uploads")
  
  try {
    if (fs.existsSync(uploadsDir)) {
      console.log("📁 清理上传文件...")
      const files = fs.readdirSync(uploadsDir)
      
      let deletedCount = 0
      for (const file of files) {
        const filePath = path.join(uploadsDir, file)
        const stat = fs.statSync(filePath)
        
        if (stat.isFile()) {
          fs.unlinkSync(filePath)
          deletedCount++
        }
      }
      
      console.log(`🗑️ 已删除 ${deletedCount} 个上传文件`)
    } else {
      console.log("📁 uploads目录不存在，跳过文件清理")
    }
  } catch (error) {
    console.error("❌ 清理上传文件失败:", error.message)
  }
}

// 主清理函数
async function productionCleanup() {
  let stats = {
    matchingRecords: 0,
    matchingTasks: 0,
    products: 0,
    templates: 0,
    files: 0
  }

  try {
    console.log("🔄 连接数据库...")
    await mongoose.connect(config.MONGODB_URI)
    console.log("✅ 数据库连接成功")

    // 获取清理前的统计数据
    console.log("\n📊 清理前统计:")
    stats.matchingRecords = await MatchingRecord.countDocuments()
    stats.matchingTasks = await MatchingTask.countDocuments() 
    stats.products = await Product.countDocuments()
    stats.templates = await ProductTemplate.countDocuments()
    
    console.log(`   匹配记录: ${stats.matchingRecords}`)
    console.log(`   匹配任务: ${stats.matchingTasks}`)
    console.log(`   商品数据: ${stats.products}`)
    console.log(`   商品模板: ${stats.templates}`)

    // 1. 删除匹配记录 (最底层，依赖其他数据)
    console.log("\n🧹 删除匹配记录...")
    const deletedRecords = await MatchingRecord.deleteMany({})
    console.log(`🗑️ 已删除 ${deletedRecords.deletedCount} 条匹配记录`)

    // 2. 删除匹配任务
    console.log("\n🧹 删除匹配任务...")
    const deletedTasks = await MatchingTask.deleteMany({})
    console.log(`🗑️ 已删除 ${deletedTasks.deletedCount} 个匹配任务`)

    // 3. 删除商品数据
    console.log("\n🧹 删除商品数据...")
    const deletedProducts = await Product.deleteMany({})
    console.log(`🗑️ 已删除 ${deletedProducts.deletedCount} 个商品`)

    // 4. 删除商品模板
    console.log("\n🧹 删除商品模板...")
    const deletedTemplates = await ProductTemplate.deleteMany({})
    console.log(`🗑️ 已删除 ${deletedTemplates.deletedCount} 个模板`)

    // 5. 清理上传文件
    console.log("\n🧹 清理上传文件...")
    await cleanupUploads()

    // 最终统计
    console.log("\n✅ 生产环境清理完成！")
    console.log("\n📊 清理结果:")
    console.log(`   ✓ 匹配记录: ${deletedRecords.deletedCount}/${stats.matchingRecords}`)
    console.log(`   ✓ 匹配任务: ${deletedTasks.deletedCount}/${stats.matchingTasks}`)
    console.log(`   ✓ 商品数据: ${deletedProducts.deletedCount}/${stats.products}`)
    console.log(`   ✓ 商品模板: ${deletedTemplates.deletedCount}/${stats.templates}`)
    console.log("   ✓ 上传文件: 已清理")
    console.log("   ✓ 用户数据: 已保留")

    console.log("\n🎉 系统已准备好上线！")
    
  } catch (error) {
    console.error("\n❌ 清理过程失败:", error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log("\n🔌 数据库连接已关闭")
    rl.close()
  }
}

// 主执行流程
async function main() {
  console.log("🚨 生产环境数据清理脚本")
  console.log("=" * 50)
  console.log("\n⚠️  警告：此操作将永久删除以下数据：")
  console.log("   • 所有商品模板")
  console.log("   • 所有商品档案") 
  console.log("   • 所有匹配任务和记录")
  console.log("   • 所有上传的文件")
  console.log("\n✅ 以下数据将被保留：")
  console.log("   • 用户账户信息")
  console.log("   • 系统配置数据")

  console.log(`\n🔐 安全确认码: ${CONFIRMATION_CODE}`)
  console.log("\n请确认以下信息：")
  
  // 环境确认
  const env = await askConfirmation("1. 当前环境 (输入 'production' 确认这是生产环境): ")
  if (env.toLowerCase() !== "production") {
    console.log("❌ 环境确认失败，脚本已取消")
    rl.close()
    return
  }

  // 备份确认
  const backup = await askConfirmation("2. 数据备份 (输入 'backed-up' 确认已完成数据备份): ")
  if (backup.toLowerCase() !== "backed-up") {
    console.log("❌ 请先完成数据备份，脚本已取消")
    rl.close()
    return
  }

  // 最终确认
  const code = await askConfirmation(`3. 最终确认 (输入确认码 '${CONFIRMATION_CODE}' 执行清理): `)
  if (code !== CONFIRMATION_CODE) {
    console.log("❌ 确认码错误，脚本已取消")
    rl.close()
    return
  }

  console.log("\n🚀 开始执行生产环境清理...")
  console.log("⏱️  预计用时: 1-3分钟")
  
  // 最后3秒倒计时
  for (let i = 3; i >= 1; i--) {
    console.log(`⏰ ${i}秒后开始清理...`)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  await productionCleanup()
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error)
}

module.exports = productionCleanup
