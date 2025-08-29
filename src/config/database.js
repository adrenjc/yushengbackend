/**
 * MongoDB数据库连接配置
 */
const mongoose = require("mongoose")
const { logger } = require("../utils/logger")
const config = require("./env")

class Database {
  constructor() {
    this.isConnected = false
  }

  /**
   * 连接MongoDB数据库
   */
  async connect() {
    try {
      const mongoOptions = {
        // 连接池配置
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        // 其他配置
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }

      const mongoUri =
        config.NODE_ENV === "test"
          ? config.MONGODB_TEST_URI
          : config.MONGODB_URI

      await mongoose.connect(mongoUri, mongoOptions)

      this.isConnected = true
      logger.info(`MongoDB连接成功: ${mongoUri}`)

      // 监听连接事件
      this.setupEventListeners()
    } catch (error) {
      logger.error("MongoDB连接失败:", error)
      throw error
    }
  }

  /**
   * 断开数据库连接
   */
  async disconnect() {
    try {
      await mongoose.disconnect()
      this.isConnected = false
      logger.info("MongoDB连接已断开")
    } catch (error) {
      logger.error("MongoDB断开连接失败:", error)
      throw error
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 连接断开事件
    mongoose.connection.on("disconnected", () => {
      this.isConnected = false
      logger.warn("MongoDB连接已断开")
    })

    // 连接错误事件
    mongoose.connection.on("error", (error) => {
      logger.error("MongoDB连接错误:", error)
    })

    // 重新连接事件
    mongoose.connection.on("reconnected", () => {
      this.isConnected = true
      logger.info("MongoDB重新连接成功")
    })

    // 进程退出时关闭连接
    process.on("SIGINT", async () => {
      await this.disconnect()
      process.exit(0)
    })
  }

  /**
   * 获取连接状态
   */
  getConnectionState() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await mongoose.connection.db.admin().ping()
      return true
    } catch (error) {
      logger.error("数据库健康检查失败:", error)
      return false
    }
  }
}

// 创建单例实例
const database = new Database()

module.exports = database


