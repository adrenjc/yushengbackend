/**
 * 匹配记忆管理路由
 */
const express = require("express")
const router = express.Router()
const { authenticateToken: auth } = require("../middleware/auth.middleware")
const {
  getMemories,
  getMemoryById,
  updateMemory,
  deleteMemory,
  cleanupMemories,
  getMemoryStatistics,
  clearAllMemories,
} = require("../controllers/memory.controller")

// 获取记忆列表
router.get("/", auth, getMemories)

// 获取记忆统计
router.get("/statistics", auth, getMemoryStatistics)

// 清理废弃记忆
router.post("/cleanup", auth, cleanupMemories)

// 清空所有记忆（危险操作，仅用于测试）- 放在动态路由前面
router.delete("/clear-all", auth, clearAllMemories)

// 获取单个记忆详情
router.get("/:id", auth, getMemoryById)

// 更新记忆
router.patch("/:id", auth, updateMemory)

// 删除记忆
router.delete("/:id", auth, deleteMemory)

module.exports = router
