/**
 * JWT认证中间件
 */
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const { logger } = require("../utils/logger")
const config = require("../config/env")

/**
 * JWT令牌验证中间件
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1] // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "访问令牌缺失",
        isAuthError: true,
      })
    }

    // 开发环境快捷放行：支持前端开发模式使用的 dev-mock-token
    if (process.env.NODE_ENV === "development" && token === "dev-mock-token") {
      // 挂载一个具有管理员权限的mock用户，最小字段集以满足后续权限校验
      req.user = {
        _id: "000000000000000000000000",
        email: "dev@example.com",
        role: "admin",
        isActive: true,
        permissions: [
          "product.read",
          "product.write",
          "product.delete",
          "template.view",
          "template.create",
          "template.update",
          "template.delete",
          "template.manage",
          "matching.create",
          "matching.review",
          "matching.confirm",
          "price.read",
          "price.write",
          "report.read",
          "user.manage",
          "system.config",
        ],
      }
      return next()
    }

    // 验证令牌
    const decoded = jwt.verify(token, config.JWT.secret)

    // 获取用户信息
    const user = await User.findById(decoded.userId).select("-password").lean()

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "用户不存在",
        isAuthError: true,
      })
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "用户账户已被禁用",
        isAuthError: true,
      })
    }

    // 检查账户是否被锁定
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(401).json({
        success: false,
        message: "账户已被锁定，请稍后再试",
        isAuthError: true,
      })
    }

    // 将用户信息添加到请求对象
    req.user = user
    next()
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "无效的访问令牌",
        isAuthError: true,
      })
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "访问令牌已过期",
        isAuthError: true,
      })
    }

    logger.error("JWT验证失败:", error)
    return res.status(500).json({
      success: false,
      message: "认证服务错误",
    })
  }
}

/**
 * 权限验证中间件
 */
const authorize = (permissions) => {
  return (req, res, next) => {
    try {
      const user = req.user

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "用户未认证",
          isAuthError: true,
        })
      }

      // 管理员拥有所有权限
      if (user.role === "admin") {
        return next()
      }

      // 检查权限
      const userPermissions = getUserPermissions(user)
      const hasPermission = Array.isArray(permissions)
        ? permissions.some((permission) => userPermissions.includes(permission))
        : userPermissions.includes(permissions)

      if (!hasPermission) {
        logger.warn("权限不足", {
          userId: user._id,
          userRole: user.role,
          requiredPermissions: permissions,
          userPermissions,
        })

        return res.status(403).json({
          success: false,
          message: "权限不足",
        })
      }

      next()
    } catch (error) {
      logger.error("权限验证失败:", error)
      return res.status(500).json({
        success: false,
        message: "权限验证服务错误",
      })
    }
  }
}

/**
 * 角色验证中间件
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    try {
      const user = req.user

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "用户未认证",
          isAuthError: true,
        })
      }

      const allowedRoles = Array.isArray(roles) ? roles : [roles]

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "角色权限不足",
        })
      }

      next()
    } catch (error) {
      logger.error("角色验证失败:", error)
      return res.status(500).json({
        success: false,
        message: "角色验证服务错误",
      })
    }
  }
}

/**
 * 可选认证中间件（不强制要求认证）
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1]

    if (token) {
      try {
        const decoded = jwt.verify(token, config.JWT.secret)
        const user = await User.findById(decoded.userId)
          .select("-password")
          .lean()

        if (user && user.isActive) {
          req.user = user
        }
      } catch (error) {
        // 忽略令牌错误，继续处理请求
      }
    }

    next()
  } catch (error) {
    logger.error("可选认证处理失败:", error)
    next() // 继续处理请求
  }
}

/**
 * 获取用户权限列表
 */
const getUserPermissions = (user) => {
  const rolePermissions = {
    admin: [
      "product.read",
      "product.write",
      "product.delete",
      "template.view",
      "template.create",
      "template.update",
      "template.delete",
      "template.manage",
      "matching.create",
      "matching.review",
      "matching.confirm",
      "price.read",
      "price.write",
      "report.read",
      "user.manage",
      "system.config",
    ],
    reviewer: [
      "product.read",
      "product.write",
      "template.view",
      "template.create",
      "template.update",
      "template.delete",
      "matching.create",
      "matching.review",
      "matching.confirm",
      "price.read",
      "price.write",
      "report.read",
    ],
    operator: [
      "product.read",
      "product.write",
      "template.view",
      "template.create",
      "template.update",
      "matching.create",
      "matching.review",
      "price.read",
      "report.read",
    ],
    viewer: ["product.read", "template.view", "price.read", "report.read"],
  }

  const rolePerms = rolePermissions[user.role] || []
  const customPerms = user.permissions || []

  return [...new Set([...rolePerms, ...customPerms])]
}

/**
 * 生成JWT令牌
 */
const generateTokens = (userId) => {
  const payload = { userId }

  const accessToken = jwt.sign(payload, config.JWT.secret, {
    expiresIn: config.JWT.expiresIn,
  })

  const refreshToken = jwt.sign(payload, config.JWT.secret, {
    expiresIn: config.JWT.refreshExpiresIn,
  })

  return { accessToken, refreshToken }
}

/**
 * 验证刷新令牌
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.JWT.secret)
  } catch (error) {
    return null
  }
}

/**
 * 记录用户活动中间件
 */
const logUserActivity = (action) => {
  return (req, res, next) => {
    try {
      const user = req.user
      if (user) {
        logger.info("用户活动", {
          userId: user._id,
          userEmail: user.email,
          action,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          timestamp: new Date().toISOString(),
        })

        // 更新用户最后活动时间
        User.findByIdAndUpdate(user._id, {
          "stats.lastActivityAt": new Date(),
        }).catch((error) => {
          logger.error("更新用户活动时间失败:", error)
        })
      }

      next()
    } catch (error) {
      logger.error("记录用户活动失败:", error)
      next() // 继续处理请求
    }
  }
}

/**
 * 检查资源所有权中间件
 */
const checkResourceOwnership = (resourceModel, resourceIdParam = "id") => {
  return async (req, res, next) => {
    try {
      const user = req.user
      const resourceId = req.params[resourceIdParam]

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: "资源ID缺失",
        })
      }

      const resource = await resourceModel.findById(resourceId)

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: "资源不存在",
        })
      }

      // 管理员可以访问所有资源
      if (user.role === "admin") {
        req.resource = resource
        return next()
      }

      // 检查资源所有权
      const isOwner =
        resource.createdBy &&
        resource.createdBy.toString() === user._id.toString()

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: "无权访问此资源",
        })
      }

      req.resource = resource
      next()
    } catch (error) {
      logger.error("资源所有权检查失败:", error)
      return res.status(500).json({
        success: false,
        message: "资源验证服务错误",
      })
    }
  }
}

module.exports = {
  authenticateToken,
  authorize,
  requireRole,
  optionalAuth,
  getUserPermissions,
  generateTokens,
  verifyRefreshToken,
  logUserActivity,
  checkResourceOwnership,
}
