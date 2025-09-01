/**
 * 数据备份脚本
 * 
 * 在执行生产环境清理前，使用此脚本创建数据备份
 * 
 * 使用方法：
 * node scripts/backup-data.js
 */

const mongoose = require("mongoose")
const fs = require("fs")
const path = require("path")
const config = require("../src/config/env")

// 导入模型
const Product = require("../src/models/Product")
const ProductTemplate = require("../src/models/ProductTemplate")
const MatchingTask = require("../src/models/MatchingTask")
const MatchingRecord = require("../src/models/MatchingRecord")
const User = require("../src/models/User")

async function backupData() {
  try {
    console.log("🔄 连接数据库...")
    await mongoose.connect(config.MONGODB_URI)
    console.log("✅ 数据库连接成功")

    // 创建备份目录
    const backupDir = path.join(__dirname, "../backups")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = path.join(backupDir, `backup-${timestamp}`)
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    fs.mkdirSync(backupPath, { recursive: true })

    console.log(`📁 备份路径: ${backupPath}`)

    // 备份各个集合
    const collections = [
      { name: "templates", model: ProductTemplate },
      { name: "products", model: Product },
      { name: "matching-tasks", model: MatchingTask },
      { name: "matching-records", model: MatchingRecord },
      { name: "users", model: User }
    ]

    for (const collection of collections) {
      console.log(`💾 备份 ${collection.name}...`)
      
      const data = await collection.model.find({}).lean()
      const filePath = path.join(backupPath, `${collection.name}.json`)
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
      console.log(`   ✓ ${data.length} 条记录已备份到 ${collection.name}.json`)
    }

    // 备份上传文件
    console.log("📁 备份上传文件...")
    const uploadsDir = path.join(__dirname, "../uploads")
    const backupUploadsDir = path.join(backupPath, "uploads")
    
    if (fs.existsSync(uploadsDir)) {
      fs.mkdirSync(backupUploadsDir, { recursive: true })
      
      const files = fs.readdirSync(uploadsDir)
      let copiedFiles = 0
      
      for (const file of files) {
        const srcPath = path.join(uploadsDir, file)
        const destPath = path.join(backupUploadsDir, file)
        
        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, destPath)
          copiedFiles++
        }
      }
      
      console.log(`   ✓ ${copiedFiles} 个文件已备份`)
    } else {
      console.log("   ℹ️ uploads目录不存在")
    }

    // 创建恢复脚本
    const restoreScript = `/**
 * 数据恢复脚本
 * 自动生成于: ${new Date().toISOString()}
 */

const mongoose = require("mongoose")
const fs = require("fs")
const path = require("path")
const config = require("../src/config/env")

async function restoreData() {
  try {
    await mongoose.connect(config.MONGODB_URI)
    console.log("✅ 数据库连接成功")

    const Product = require("../src/models/Product")
    const ProductTemplate = require("../src/models/ProductTemplate")
    const MatchingTask = require("../src/models/MatchingTask")
    const MatchingRecord = require("../src/models/MatchingRecord")
    const User = require("../src/models/User")

    const backupDir = __dirname

    // 恢复模板
    const templates = JSON.parse(fs.readFileSync(path.join(backupDir, "templates.json")))
    if (templates.length > 0) {
      await ProductTemplate.insertMany(templates)
      console.log(\`✓ 已恢复 \${templates.length} 个模板\`)
    }

    // 恢复商品
    const products = JSON.parse(fs.readFileSync(path.join(backupDir, "products.json")))
    if (products.length > 0) {
      await Product.insertMany(products)
      console.log(\`✓ 已恢复 \${products.length} 个商品\`)
    }

    // 恢复匹配任务
    const tasks = JSON.parse(fs.readFileSync(path.join(backupDir, "matching-tasks.json")))
    if (tasks.length > 0) {
      await MatchingTask.insertMany(tasks)
      console.log(\`✓ 已恢复 \${tasks.length} 个匹配任务\`)
    }

    // 恢复匹配记录
    const records = JSON.parse(fs.readFileSync(path.join(backupDir, "matching-records.json")))
    if (records.length > 0) {
      await MatchingRecord.insertMany(records)
      console.log(\`✓ 已恢复 \${records.length} 条匹配记录\`)
    }

    console.log("🎉 数据恢复完成!")
  } catch (error) {
    console.error("❌ 恢复失败:", error)
  } finally {
    await mongoose.disconnect()
  }
}

if (require.main === module) {
  restoreData()
}
`

    fs.writeFileSync(path.join(backupPath, "restore.js"), restoreScript)

    console.log("\n✅ 备份完成！")
    console.log(`📦 备份位置: ${backupPath}`)
    console.log("🔄 恢复方法: node restore.js (在备份目录中执行)")

  } catch (error) {
    console.error("❌ 备份失败:", error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log("🔌 数据库连接已关闭")
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log("💾 开始数据备份...")
  backupData()
}

module.exports = backupData
