/**
 * 认证路由
 */
const express = require("express")
const {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  updateProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
} = require("../controllers/auth.controller")

const { authenticateToken } = require("../middleware/auth.middleware")
const { validateRequest } = require("../middleware/validation.middleware")
const {
  userRegistrationSchema,
  userLoginSchema,
} = require("../middleware/validation.middleware")

const router = express.Router()

/**
 * 公开路由（不需要认证）
 */

// 用户注册
router.post("/register", validateRequest(userRegistrationSchema), register)

// 用户登录
router.post("/login", validateRequest(userLoginSchema), login)

// 刷新令牌
router.post("/refresh", refreshToken)

// 请求密码重置
router.post(
  "/forgot-password",
  validateRequest({
    body: require("joi").object({
      email: require("joi").string().email().required(),
    }),
  }),
  requestPasswordReset
)

// 重置密码
router.post(
  "/reset-password",
  validateRequest({
    body: require("joi").object({
      token: require("joi").string().required(),
      newPassword: require("joi").string().min(6).required(),
    }),
  }),
  resetPassword
)

/**
 * 受保护路由（需要认证）
 */

// 用户登出
router.post("/logout", authenticateToken, logout)

// 获取当前用户信息
router.get("/me", authenticateToken, getCurrentUser)

// 更新用户资料
router.put(
  "/profile",
  authenticateToken,
  validateRequest({
    body: require("joi")
      .object({
        name: require("joi").string().min(2).max(50),
        department: require("joi").string().max(100).allow(""),
        position: require("joi").string().max(100).allow(""),
        preferences: require("joi").object({
          theme: require("joi").string().valid("light", "dark", "auto"),
          language: require("joi").string().valid("zh-CN", "en-US"),
          notifications: require("joi").object({
            email: require("joi").boolean(),
            browser: require("joi").boolean(),
            matching: require("joi").boolean(),
            price: require("joi").boolean(),
          }),
        }),
      })
      .min(1),
  }),
  updateProfile
)

// 修改密码
router.put(
  "/password",
  authenticateToken,
  validateRequest({
    body: require("joi").object({
      currentPassword: require("joi").string().required(),
      newPassword: require("joi").string().min(6).required(),
    }),
  }),
  changePassword
)

module.exports = router


