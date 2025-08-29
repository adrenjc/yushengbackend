/**
 * 数据库清理脚本
 * 清理冲突的数据并重置索引
 */
const mongoose = require("mongoose")
const config = require("../src/config/env")

async function cleanDatabase() {
  try {
    console.log("🔄 连接数据库...")
    await mongoose.connect(config.MONGODB_URI)
    console.log("✅ 数据库连接成功")

    const db = mongoose.connection.db

    // 清理用户集合中的冲突记录
    console.log("🧹 清理用户集合...")
    const userCollection = db.collection("users")

    // 删除所有email为null的记录（避免索引冲突）
    const deleteResult = await userCollection.deleteMany({
      $or: [{ email: null }, { email: { $exists: false } }, { email: "" }],
    })
    console.log(`🗑️ 删除了 ${deleteResult.deletedCount} 个冲突的用户记录`)

    // 检查并删除email索引（如果存在）
    try {
      const indexes = await userCollection.listIndexes().toArray()
      const emailIndex = indexes.find((index) => index.key && index.key.email)
      if (emailIndex) {
        await userCollection.dropIndex("email_1")
        console.log("🗑️ 删除了email索引")
      }
    } catch (error) {
      console.log("ℹ️ email索引不存在或已删除")
    }

    // 清理模板集合（如果需要）
    console.log("🧹 检查模板集合...")
    const templateCollection = db.collection("producttemplates")
    const templateCount = await templateCollection.countDocuments()
    console.log(`📊 当前模板数量: ${templateCount}`)

    console.log("✅ 数据库清理完成！")
  } catch (error) {
    console.error("❌ 数据库清理失败:", error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log("🔌 数据库连接已关闭")
    process.exit(0)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log("🚀 开始清理数据库...")
  cleanDatabase()
}

module.exports = cleanDatabase
