/**
 * 错误处理中间件
 * 提供统一的错误处理和响应格式
 */
const { logger } = require("../utils/logger")

/**
 * 业务逻辑错误类
 */
class BusinessError extends Error {
  constructor(message, statusCode = 400, code = null) {
    super(message)
    this.name = "BusinessError"
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
  }
}

/**
 * 验证错误类
 */
class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message)
    this.name = "ValidationError"
    this.statusCode = 400
    this.errors = errors
    this.isOperational = true
  }
}

/**
 * 授权错误类
 */
class AuthorizationError extends Error {
  constructor(message = "权限不足") {
    super(message)
    this.name = "AuthorizationError"
    this.statusCode = 403
    this.isOperational = true
  }
}

/**
 * 认证错误类
 */
class AuthenticationError extends Error {
  constructor(message = "认证失败") {
    super(message)
    this.name = "AuthenticationError"
    this.statusCode = 401
    this.isOperational = true
  }
}

/**
 * 资源未找到错误类
 */
class NotFoundError extends Error {
  constructor(message = "资源未找到") {
    super(message)
    this.name = "NotFoundError"
    this.statusCode = 404
    this.isOperational = true
  }
}

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err }
  error.message = err.message

  // 记录错误日志
  logger.error("错误处理中间件捕获到错误:", {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  })

  // MongoDB错误处理
  if (err.name === "CastError") {
    const message = "资源未找到"
    error = new NotFoundError(message)
  }

  // MongoDB重复键错误
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    const message = `${field}已存在`
    error = new BusinessError(message, 400)
  }

  // MongoDB验证错误
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((val) => ({
      field: val.path,
      message: val.message,
    }))
    error = new ValidationError("数据验证失败", errors)
  }

  // JWT错误处理
  if (err.name === "JsonWebTokenError") {
    error = new AuthenticationError("无效的访问令牌")
  }

  if (err.name === "TokenExpiredError") {
    error = new AuthenticationError("访问令牌已过期")
  }

  // Multer文件上传错误
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      error = new BusinessError("文件大小超出限制")
    } else if (err.code === "LIMIT_FILE_COUNT") {
      error = new BusinessError("文件数量超出限制")
    } else {
      error = new BusinessError(`文件上传错误: ${err.message}`)
    }
  }

  // 语法错误处理
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    error = new BusinessError("请求体格式错误", 400)
  }

  // 设置默认错误信息
  const statusCode = error.statusCode || 500
  const message = error.message || "服务器内部错误"

  // 构建错误响应
  const errorResponse = {
    success: false,
    message,
    error: {
      statusCode,
      ...(error.code && { code: error.code }),
      ...(error.errors && { details: error.errors }),
    },
  }

  // 在开发环境中添加错误堆栈
  if (process.env.NODE_ENV === "development") {
    errorResponse.error.stack = err.stack
  }

  // 发送错误响应
  res.status(statusCode).json(errorResponse)
}

/**
 * 404错误处理中间件
 */
const notFoundHandler = (req, res, next) => {
  const message = `路由 ${req.originalUrl} 未找到`
  logger.warn("404错误:", {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  })

  res.status(404).json({
    success: false,
    message,
    error: {
      statusCode: 404,
    },
  })
}

/**
 * 请求体解析错误处理中间件
 */
const bodyParserErrorHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    logger.error("请求体解析错误:", {
      error: err.message,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    })

    return res.status(400).json({
      success: false,
      message: "请求体格式错误",
      error: {
        statusCode: 400,
        code: "INVALID_JSON",
      },
    })
  }
  next(err)
}

/**
 * 数据库错误处理中间件
 */
const databaseErrorHandler = (err, req, res, next) => {
  // MongoDB连接错误
  if (err.name === "MongoNetworkError" || err.name === "MongoTimeoutError") {
    logger.error("数据库连接错误:", err)
    return res.status(503).json({
      success: false,
      message: "数据库连接失败，请稍后重试",
      error: {
        statusCode: 503,
        code: "DATABASE_CONNECTION_ERROR",
      },
    })
  }

  // MongoDB服务器错误
  if (err.name === "MongoServerError") {
    logger.error("数据库服务器错误:", err)
    return res.status(500).json({
      success: false,
      message: "数据库操作失败",
      error: {
        statusCode: 500,
        code: "DATABASE_OPERATION_ERROR",
      },
    })
  }

  next(err)
}

/**
 * 异步错误捕获包装器
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

/**
 * 参数验证中间件
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body)
    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }))
      return next(new ValidationError("请求参数验证失败", errors))
    }
    next()
  }
}

/**
 * 权限检查中间件
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError())
    }

    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return next(new AuthorizationError(`需要权限: ${permission}`))
    }

    next()
  }
}

module.exports = {
  // 错误类
  BusinessError,
  ValidationError,
  AuthorizationError,
  AuthenticationError,
  NotFoundError,

  // 错误处理中间件
  errorHandler,
  notFoundHandler,
  bodyParserErrorHandler,
  databaseErrorHandler,

  // 工具函数
  asyncHandler,
  validateRequest,
  requirePermission,
}
