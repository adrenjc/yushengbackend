/**
 * 用户数据模型
 */
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")

const UserSchema = new mongoose.Schema(
  {
    // 基本信息
    username: {
      type: String,
      required: [true, "用户名不能为空"],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, "用户名至少3个字符"],
      maxlength: [50, "用户名不能超过50个字符"],
    },
    password: {
      type: String,
      required: [true, "密码不能为空"],
      minlength: [6, "密码长度至少6位"],
      select: false, // 默认不返回密码字段
    },
    name: {
      type: String,
      required: [true, "姓名不能为空"],
      trim: true,
      maxlength: [50, "姓名长度不能超过50个字符"],
    },
    avatar: {
      type: String,
      default: "",
    },

    // 权限和角色
    role: {
      type: String,
      enum: ["admin", "reviewer", "operator", "viewer"],
      default: "operator",
      required: true,
    },
    permissions: [
      {
        type: String,
        enum: [
          "product.read",
          "product.write",
          "product.delete",
          "matching.create",
          "matching.review",
          "matching.confirm",
          "price.read",
          "price.write",
          "report.read",
          "user.manage",
          "system.config",
        ],
      },
    ],

    // 工作相关
    department: {
      type: String,
      trim: true,
    },
    position: {
      type: String,
      trim: true,
    },

    // 账户状态
    isActive: {
      type: Boolean,
      default: true,
    },

    // 登录相关
    lastLoginAt: Date,
    lastLoginIP: String,
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,

    // 密码重置
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // 偏好设置
    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
        default: "light",
      },
      language: {
        type: String,
        enum: ["zh-CN", "en-US"],
        default: "zh-CN",
      },
      notifications: {
        email: { type: Boolean, default: true },
        browser: { type: Boolean, default: true },
        matching: { type: Boolean, default: true },
        price: { type: Boolean, default: true },
      },
    },

    // 统计信息
    stats: {
      totalMatches: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
      accuracyRate: { type: Number, default: 0 },
      lastActivityAt: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password
        delete ret.resetPasswordToken
        return ret
      },
    },
  }
)

// 索引 (username已在字段定义中设置unique: true，无需重复)
UserSchema.index({ role: 1, isActive: 1 })
UserSchema.index({ department: 1 })

// 虚拟字段：是否被锁定
UserSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now())
})

// 虚拟字段：完整角色权限
UserSchema.virtual("fullPermissions").get(function () {
  const rolePermissions = {
    admin: [
      "product.read",
      "product.write",
      "product.delete",
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
      "matching.create",
      "matching.review",
      "price.read",
      "report.read",
    ],
    viewer: ["product.read", "price.read", "report.read"],
  }

  const rolePerms = rolePermissions[this.role] || []
  return [...new Set([...rolePerms, ...(this.permissions || [])])]
})

// 中间件：保存前加密密码
UserSchema.pre("save", async function (next) {
  // 只有在密码被修改时才进行加密
  if (!this.isModified("password")) return next()

  try {
    // 生成盐值并加密密码
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// 实例方法：比较密码
UserSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password)
  } catch (error) {
    throw error
  }
}

// 实例方法：增加登录尝试次数
UserSchema.methods.incLoginAttempts = function () {
  // 如果之前有锁定且已过期，重置尝试次数
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    })
  }

  const updates = { $inc: { loginAttempts: 1 } }

  // 如果登录尝试次数达到5次且未被锁定，则锁定账户2小时
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 } // 2小时
  }

  return this.updateOne(updates)
}

// 实例方法：重置登录尝试
UserSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  })
}

// 实例方法：记录登录
UserSchema.methods.recordLogin = function (ip) {
  return this.updateOne({
    $set: {
      lastLoginAt: new Date(),
      lastLoginIP: ip,
      "stats.lastActivityAt": new Date(),
    },
    $unset: {
      loginAttempts: 1,
      lockUntil: 1,
    },
  })
}

// 实例方法：检查权限
UserSchema.methods.hasPermission = function (permission) {
  return this.fullPermissions.includes(permission)
}

// 实例方法：更新统计信息
UserSchema.methods.updateStats = function (type, increment = 1) {
  const updates = {
    $inc: {},
    $set: { "stats.lastActivityAt": new Date() },
  }

  switch (type) {
    case "match":
      updates.$inc["stats.totalMatches"] = increment
      break
    case "review":
      updates.$inc["stats.totalReviews"] = increment
      break
  }

  return this.updateOne(updates)
}

// 静态方法：根据用户名查找用户
UserSchema.statics.findByUsername = function (username) {
  return this.findOne({ username: username.toLowerCase() })
}

// 静态方法：获取活跃用户
UserSchema.statics.getActiveUsers = function (limit = 50) {
  return this.find({ isActive: true })
    .select("-password")
    .sort({ lastLoginAt: -1 })
    .limit(limit)
}

// 静态方法：根据角色获取用户
UserSchema.statics.getUsersByRole = function (role) {
  return this.find({ role, isActive: true })
    .select("-password")
    .sort({ name: 1 })
}

const User = mongoose.model("User", UserSchema)

module.exports = User
