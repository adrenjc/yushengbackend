/**
 * Redis配置和连接管理
 * 注意：此配置为可选，如果Redis不可用，系统仍可正常运行
 */
const redis = require("redis")
const { logger } = require("../utils/logger")
const config = require("./env")

class RedisManager {
  constructor() {
    this.client = null
    this.isConnected = false
    this.isEnabled = config.REDIS_ENABLED || false
  }

  /**
   * 初始化Redis连接
   */
  async initialize() {
    if (!this.isEnabled) {
      logger.info("Redis已禁用，系统将在无缓存模式下运行")
      return
    }

    try {
      // Redis连接配置
      const redisConfig = {
        host: config.REDIS_HOST || "localhost",
        port: config.REDIS_PORT || 6379,
        password: config.REDIS_PASSWORD || undefined,
        db: config.REDIS_DB || 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      }

      this.client = redis.createClient(redisConfig)

      // 设置事件监听器
      this.setupEventListeners()

      // 尝试连接
      await this.client.connect()
      this.isConnected = true
      logger.info("Redis连接成功")
    } catch (error) {
      logger.warn(`Redis连接失败，将在无缓存模式下运行: ${error.message}`)
      this.client = null
      this.isConnected = false
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (!this.client) return

    this.client.on("error", (error) => {
      logger.error("Redis错误:", error)
      this.isConnected = false
    })

    this.client.on("connect", () => {
      logger.info("Redis连接建立")
    })

    this.client.on("ready", () => {
      this.isConnected = true
      logger.info("Redis准备就绪")
    })

    this.client.on("end", () => {
      this.isConnected = false
      logger.info("Redis连接结束")
    })

    this.client.on("reconnecting", () => {
      logger.info("Redis重新连接中...")
    })
  }

  /**
   * 获取缓存
   */
  async get(key) {
    if (!this.isConnected || !this.client) {
      return null
    }

    try {
      const result = await this.client.get(key)
      return result ? JSON.parse(result) : null
    } catch (error) {
      logger.error(`Redis GET错误 (key: ${key}):`, error)
      return null
    }
  }

  /**
   * 设置缓存
   */
  async set(key, value, expirationInSeconds = 3600) {
    if (!this.isConnected || !this.client) {
      return false
    }

    try {
      await this.client.setEx(key, expirationInSeconds, JSON.stringify(value))
      return true
    } catch (error) {
      logger.error(`Redis SET错误 (key: ${key}):`, error)
      return false
    }
  }

  /**
   * 删除缓存
   */
  async del(key) {
    if (!this.isConnected || !this.client) {
      return false
    }

    try {
      await this.client.del(key)
      return true
    } catch (error) {
      logger.error(`Redis DEL错误 (key: ${key}):`, error)
      return false
    }
  }

  /**
   * 检查key是否存在
   */
  async exists(key) {
    if (!this.isConnected || !this.client) {
      return false
    }

    try {
      const result = await this.client.exists(key)
      return result === 1
    } catch (error) {
      logger.error(`Redis EXISTS错误 (key: ${key}):`, error)
      return false
    }
  }

  /**
   * 设置key过期时间
   */
  async expire(key, seconds) {
    if (!this.isConnected || !this.client) {
      return false
    }

    try {
      await this.client.expire(key, seconds)
      return true
    } catch (error) {
      logger.error(`Redis EXPIRE错误 (key: ${key}):`, error)
      return false
    }
  }

  /**
   * 清空所有缓存
   */
  async flushAll() {
    if (!this.isConnected || !this.client) {
      return false
    }

    try {
      await this.client.flushAll()
      logger.info("Redis缓存已清空")
      return true
    } catch (error) {
      logger.error("Redis FLUSHALL错误:", error)
      return false
    }
  }

  /**
   * 关闭连接
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit()
        logger.info("Redis连接已关闭")
      } catch (error) {
        logger.error("Redis关闭连接错误:", error)
      } finally {
        this.client = null
        this.isConnected = false
      }
    }
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isConnected: this.isConnected,
      hasClient: !!this.client,
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    if (!this.isConnected || !this.client) {
      return { status: "disabled", message: "Redis未启用或未连接" }
    }

    try {
      await this.client.ping()
      return { status: "healthy", message: "Redis连接正常" }
    } catch (error) {
      return {
        status: "unhealthy",
        message: `Redis健康检查失败: ${error.message}`,
      }
    }
  }
}

// 创建Redis管理器实例
const redisManager = new RedisManager()

// 兼容性导出
const redisClient = {
  get: (...args) => redisManager.get(...args),
  set: (...args) => redisManager.set(...args),
  del: (...args) => redisManager.del(...args),
  exists: (...args) => redisManager.exists(...args),
  expire: (...args) => redisManager.expire(...args),
  flushall: (...args) => redisManager.flushAll(...args),
  isConnected: () => redisManager.isConnected,
  getStatus: () => redisManager.getStatus(),
  healthCheck: () => redisManager.healthCheck(),
}

module.exports = {
  redisManager,
  redisClient,
}
