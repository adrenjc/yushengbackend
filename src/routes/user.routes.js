/**
 * 用户管理路由
 */
const express = require("express")
const {
  authenticateToken,
  authorize,
} = require("../middleware/auth.middleware")

const router = express.Router()

// 临时占位路由，后续完善
router.get("/", authenticateToken, authorize("user.manage"), (req, res) => {
  res.json({
    success: true,
    message: "用户管理路由开发中...",
    data: [],
  })
})

module.exports = router


