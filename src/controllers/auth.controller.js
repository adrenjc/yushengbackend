/**
 * 用户认证控制器
 */
const bcrypt = require("bcrypt")
const User = require("../models/User")
const {
  generateTokens,
  verifyRefreshToken,
} = require("../middleware/auth.middleware")
const { logger, logOperation } = require("../utils/logger")
const {
  asyncHandler,
  BusinessError,
} = require("../middleware/error.middleware")

/**
 * 用户注册
 */
const register = asyncHandler(async (req, res) => {
  const { username, password, name, role, department, position } = req.body

  // 检查用户名是否已存在
  const existingUser = await User.findByUsername(username)
  if (existingUser) {
    throw new BusinessError("用户名已被注册", 409)
  }

  // 创建新用户
  const user = new User({
    username,
    password, // 密码会在模型的pre('save')中间件中自动加密
    name,
    role: role || "operator",
    department,
    position,
  })

  await user.save()

  // 生成令牌
  const { accessToken, refreshToken } = generateTokens(user._id)

  // 记录操作日志
  logOperation("用户注册", user, { username, role })

  logger.info("用户注册成功", {
    userId: user._id,
    username: user.username,
    role: user.role,
  })

  res.status(201).json({
    success: true,
    message: "注册成功",
    data: {
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        department: user.department,
        position: user.position,
        createdAt: user.createdAt,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    },
  })
})

/**
 * 用户登录
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body

  // 查找用户（包含密码字段）
  const user = await User.findByUsername(username).select("+password")

  if (!user) {
    throw new BusinessError("用户名或密码错误", 401)
  }

  // 检查账户状态
  if (!user.isActive) {
    throw new BusinessError("账户已被禁用，请联系管理员", 401)
  }

  // 检查账户是否被锁定
  if (user.isLocked) {
    throw new BusinessError("账户已被锁定，请稍后再试", 401)
  }

  // 验证密码
  const isPasswordValid = await user.comparePassword(password)

  if (!isPasswordValid) {
    // 增加登录尝试次数
    await user.incLoginAttempts()
    throw new BusinessError("用户名或密码错误", 401)
  }

  // 重置登录尝试次数并记录登录
  await user.resetLoginAttempts()
  await user.recordLogin(req.ip)

  // 生成令牌
  const { accessToken, refreshToken } = generateTokens(user._id)

  // 记录操作日志
  logOperation("用户登录", user, { ip: req.ip })

  logger.info("用户登录成功", {
    userId: user._id,
    username: user.username,
    ip: req.ip,
  })

  res.json({
    success: true,
    message: "登录成功",
    data: {
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        department: user.department,
        position: user.position,
        avatar: user.avatar,
        lastLoginAt: user.lastLoginAt,
        permissions: user.fullPermissions,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    },
  })
})

/**
 * 刷新令牌
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body

  if (!token) {
    throw new BusinessError("刷新令牌缺失", 401)
  }

  // 验证刷新令牌
  const decoded = verifyRefreshToken(token)
  if (!decoded) {
    throw new BusinessError("无效的刷新令牌", 401)
  }

  // 查找用户
  const user = await User.findById(decoded.userId)
  if (!user || !user.isActive) {
    throw new BusinessError("用户不存在或已被禁用", 401)
  }

  // 生成新的令牌对
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(
    user._id
  )

  logger.info("令牌刷新成功", {
    userId: user._id,
    email: user.email,
  })

  res.json({
    success: true,
    message: "令牌刷新成功",
    data: {
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    },
  })
})

/**
 * 用户登出
 */
const logout = asyncHandler(async (req, res) => {
  const user = req.user

  // 记录操作日志
  logOperation("用户登出", user)

  logger.info("用户登出", {
    userId: user._id,
    email: user.email,
  })

  res.json({
    success: true,
    message: "登出成功",
  })
})

/**
 * 获取当前用户信息
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = req.user

  // 获取完整用户信息
  const fullUser = await User.findById(user._id).populate("department").lean()

  res.json({
    success: true,
    data: {
      user: {
        id: fullUser._id,
        email: fullUser.email,
        name: fullUser.name,
        role: fullUser.role,
        department: fullUser.department,
        position: fullUser.position,
        avatar: fullUser.avatar,
        isActive: fullUser.isActive,
        isEmailVerified: fullUser.isEmailVerified,
        lastLoginAt: fullUser.lastLoginAt,
        preferences: fullUser.preferences,
        stats: fullUser.stats,
        permissions: fullUser.fullPermissions,
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt,
      },
    },
  })
})

/**
 * 更新用户信息
 */
const updateProfile = asyncHandler(async (req, res) => {
  const user = req.user
  const { name, department, position, preferences } = req.body

  // 更新用户信息
  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        name,
        department,
        position,
        preferences,
        updatedAt: new Date(),
      },
    },
    { new: true, runValidators: true }
  ).lean()

  // 记录操作日志
  logOperation("更新用户资料", user, {
    changes: { name, department, position, preferences },
  })

  logger.info("用户资料更新成功", {
    userId: user._id,
    email: user.email,
  })

  res.json({
    success: true,
    message: "资料更新成功",
    data: {
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        department: updatedUser.department,
        position: updatedUser.position,
        avatar: updatedUser.avatar,
        preferences: updatedUser.preferences,
        updatedAt: updatedUser.updatedAt,
      },
    },
  })
})

/**
 * 修改密码
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body
  const user = req.user

  // 获取包含密码的用户信息
  const userWithPassword = await User.findById(user._id).select("+password")

  // 验证当前密码
  const isCurrentPasswordValid = await userWithPassword.comparePassword(
    currentPassword
  )
  if (!isCurrentPasswordValid) {
    throw new BusinessError("当前密码错误", 400)
  }

  // 检查新密码是否与当前密码相同
  const isSamePassword = await userWithPassword.comparePassword(newPassword)
  if (isSamePassword) {
    throw new BusinessError("新密码不能与当前密码相同", 400)
  }

  // 更新密码
  userWithPassword.password = newPassword
  await userWithPassword.save()

  // 记录操作日志
  logOperation("修改密码", user)

  logger.info("用户密码修改成功", {
    userId: user._id,
    email: user.email,
  })

  res.json({
    success: true,
    message: "密码修改成功",
  })
})

/**
 * 请求密码重置
 */
const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body

  const user = await User.findByEmail(email)
  if (!user) {
    // 出于安全考虑，不透露用户是否存在
    return res.json({
      success: true,
      message: "如果邮箱存在，重置链接已发送",
    })
  }

  // 生成重置令牌（这里简化处理，实际应该生成随机令牌）
  const resetToken = generateTokens(user._id).accessToken
  const resetExpires = new Date(Date.now() + 1 * 60 * 60 * 1000) // 1小时后过期

  // 保存重置令牌
  await User.findByIdAndUpdate(user._id, {
    resetPasswordToken: resetToken,
    resetPasswordExpires: resetExpires,
  })

  // 这里应该发送邮件，暂时省略
  logger.info("密码重置请求", {
    userId: user._id,
    email: user.email,
  })

  res.json({
    success: true,
    message: "重置链接已发送到您的邮箱",
    // 开发环境返回令牌（生产环境删除）
    ...(process.env.NODE_ENV === "development" && { resetToken }),
  })
})

/**
 * 重置密码
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body

  // 查找具有有效重置令牌的用户
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  }).select("+password")

  if (!user) {
    throw new BusinessError("重置令牌无效或已过期", 400)
  }

  // 更新密码并清除重置令牌
  user.password = newPassword
  user.resetPasswordToken = undefined
  user.resetPasswordExpires = undefined
  await user.save()

  // 记录操作日志
  logOperation("密码重置", user)

  logger.info("密码重置成功", {
    userId: user._id,
    email: user.email,
  })

  res.json({
    success: true,
    message: "密码重置成功",
  })
})

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  updateProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
}
