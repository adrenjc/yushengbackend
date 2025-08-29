/**
 * 文件上传中间件配置
 */
const multer = require("multer")
const path = require("path")
const fs = require("fs")

// 确保上传目录存在
const uploadDir = path.join(__dirname, "../../uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // 处理中文文件名编码
    try {
      file.originalname = Buffer.from(file.originalname, "latin1").toString(
        "utf8"
      )
    } catch (error) {
      console.log("文件名编码处理失败，使用原始名称")
    }

    // 生成唯一的文件名
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const fileExtension = path.extname(file.originalname)
    cb(null, `product-upload-${uniqueSuffix}${fileExtension}`)
  },
})

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".xlsx", ".xls", ".csv"]
  const fileExtension = path.extname(file.originalname).toLowerCase()

  if (allowedExtensions.includes(fileExtension)) {
    cb(null, true)
  } else {
    cb(new Error("不支持的文件格式，请上传 .xlsx, .xls 或 .csv 文件"), false)
  }
}

// multer配置
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1, // 单个文件
  },
})

// 单文件上传中间件
const uploadSingle = upload.single("file")

// 错误处理中间件
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "文件大小超过限制（最大10MB）",
      })
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "只能上传一个文件",
      })
    }
    return res.status(400).json({
      success: false,
      message: `文件上传错误: ${err.message}`,
    })
  }

  if (err.message.includes("不支持的文件格式")) {
    return res.status(400).json({
      success: false,
      message: err.message,
    })
  }

  next(err)
}

module.exports = {
  uploadSingle,
  handleUploadError,
}
