/**
 * Excel文件解析工具
 */
const XLSX = require("xlsx")
const csv = require("csv-parser")
const fs = require("fs")
const path = require("path")
const { logger } = require("./logger")

class ExcelParser {
  constructor() {
    // 标准列名映射
    this.columnMapping = {
      // 商品名称的可能列名
      name: [
        "商品名称",
        "名称",
        "商品",
        "产品名称",
        "品名",
        "name",
        "product",
        "item",
      ],
      // 价格的可能列名
      price: [
        "价格",
        "单价",
        "售价",
        "零售价",
        "批发价",
        "price",
        "cost",
        "amount",
      ],
      // 数量的可能列名
      quantity: ["数量", "数目", "件数", "quantity", "qty", "count"],
      // 单位的可能列名
      unit: ["单位", "unit"],
      // 供应商的可能列名
      supplier: [
        "供应商",
        "厂家",
        "生产商",
        "supplier",
        "vendor",
        "manufacturer",
      ],
      // 规格的可能列名
      specification: [
        "规格",
        "型号",
        "包装",
        "spec",
        "specification",
        "package",
      ],
      // 备注的可能列名
      note: ["备注", "说明", "描述", "note", "remark", "description"],
    }
  }

  /**
   * 解析批发数据文件
   * @param {string} filePath 文件路径
   * @param {Object} options 解析选项
   * @returns {Object} 解析结果
   */
  async parseWholesaleFile(filePath, options = {}) {
    try {
      const fileExtension = path.extname(filePath).toLowerCase()
      let rawData = []

      // 根据文件类型选择解析方法
      switch (fileExtension) {
        case ".xlsx":
        case ".xls":
          rawData = await this.parseExcelFile(filePath, options)
          break
        case ".csv":
          rawData = await this.parseCsvFile(filePath, options)
          break
        default:
          throw new Error(`不支持的文件类型: ${fileExtension}`)
      }

      // 数据标准化和验证
      const processedData = this.processRawData(rawData, options)

      // 生成解析报告
      const report = this.generateParseReport(rawData, processedData)

      logger.info("文件解析完成", {
        filePath,
        rawCount: rawData.length,
        validCount: processedData.validItems.length,
        errorCount: processedData.errorItems.length,
      })

      return {
        success: true,
        data: processedData.validItems,
        errors: processedData.errorItems,
        report,
        metadata: {
          fileName: path.basename(filePath),
          fileSize: fs.statSync(filePath).size,
          totalRows: rawData.length,
          validRows: processedData.validItems.length,
          errorRows: processedData.errorItems.length,
          parseTime: new Date().toISOString(),
        },
      }
    } catch (error) {
      logger.error("文件解析失败:", error)
      return {
        success: false,
        error: error.message,
        data: [],
        errors: [],
        report: null,
      }
    }
  }

  /**
   * 解析Excel文件
   * @param {string} filePath 文件路径
   * @param {Object} options 选项
   * @returns {Array} 原始数据数组
   */
  async parseExcelFile(filePath, options = {}) {
    try {
      const workbook = XLSX.readFile(filePath)
      const sheetName = options.sheetName || workbook.SheetNames[0]

      if (!workbook.Sheets[sheetName]) {
        throw new Error(`工作表 "${sheetName}" 不存在`)
      }

      const worksheet = workbook.Sheets[sheetName]

      // 转换为JSON格式
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1, // 使用第一行作为表头
        defval: "", // 空单元格默认值
        blankrows: false, // 跳过空行
      })

      if (jsonData.length === 0) {
        throw new Error("文件内容为空")
      }

      // 第一行作为表头
      const headers = jsonData[0]
      const dataRows = jsonData.slice(1)

      // 转换为对象数组
      const result = dataRows
        .map((row, index) => {
          const item = { _rowIndex: index + 2 } // Excel行号从2开始

          headers.forEach((header, colIndex) => {
            item[header] = row[colIndex] || ""
          })

          return item
        })
        .filter((item) => {
          // 过滤掉完全空白的行
          const values = Object.values(item).filter(
            (v) => v !== "" && v !== null && v !== undefined
          )
          return values.length > 1 // 至少有一个非空值（除了_rowIndex）
        })

      return result
    } catch (error) {
      throw new Error(`Excel文件解析失败: ${error.message}`)
    }
  }

  /**
   * 解析CSV文件
   * @param {string} filePath 文件路径
   * @param {Object} options 选项
   * @returns {Promise<Array>} 原始数据数组
   */
  parseCsvFile(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const results = []
      let rowIndex = 0

      fs.createReadStream(filePath)
        .pipe(
          csv({
            encoding: options.encoding || "utf8",
            skipEmptyLines: true,
            skipLinesWithError: true,
          })
        )
        .on("data", (data) => {
          rowIndex++
          data._rowIndex = rowIndex + 1 // CSV行号从2开始（包含表头）
          results.push(data)
        })
        .on("end", () => {
          resolve(results)
        })
        .on("error", (error) => {
          reject(new Error(`CSV文件解析失败: ${error.message}`))
        })
    })
  }

  /**
   * 处理原始数据
   * @param {Array} rawData 原始数据
   * @param {Object} options 选项
   * @returns {Object} 处理结果
   */
  processRawData(rawData, options = {}) {
    const validItems = []
    const errorItems = []

    // 自动检测列映射
    const columnMap = this.detectColumnMapping(rawData[0] || {})

    rawData.forEach((row, index) => {
      try {
        const processedItem = this.processDataRow(row, columnMap, options)

        // 验证必需字段
        const validation = this.validateDataItem(processedItem)

        if (validation.isValid) {
          validItems.push(processedItem)
        } else {
          errorItems.push({
            rowIndex: row._rowIndex || index + 1,
            originalData: row,
            errors: validation.errors,
            type: "validation_error",
          })
        }
      } catch (error) {
        errorItems.push({
          rowIndex: row._rowIndex || index + 1,
          originalData: row,
          errors: [error.message],
          type: "processing_error",
        })
      }
    })

    return { validItems, errorItems }
  }

  /**
   * 自动检测列映射
   * @param {Object} sampleRow 样本行数据
   * @returns {Object} 列映射对象
   */
  detectColumnMapping(sampleRow) {
    const columnMap = {}
    const columns = Object.keys(sampleRow).filter((key) => key !== "_rowIndex")

    // 为每个标准字段找到最匹配的列
    Object.keys(this.columnMapping).forEach((standardField) => {
      const possibleNames = this.columnMapping[standardField]

      // 查找完全匹配
      let matchedColumn = columns.find((col) =>
        possibleNames.some(
          (name) => col.toLowerCase().trim() === name.toLowerCase()
        )
      )

      // 如果没有完全匹配，查找包含关系
      if (!matchedColumn) {
        matchedColumn = columns.find((col) =>
          possibleNames.some(
            (name) =>
              col.toLowerCase().includes(name.toLowerCase()) ||
              name.toLowerCase().includes(col.toLowerCase())
          )
        )
      }

      if (matchedColumn) {
        columnMap[standardField] = matchedColumn
      }
    })

    logger.info("列映射检测结果:", columnMap)
    return columnMap
  }

  /**
   * 处理单行数据
   * @param {Object} row 原始行数据
   * @param {Object} columnMap 列映射
   * @param {Object} options 选项
   * @returns {Object} 处理后的数据项
   */
  processDataRow(row, columnMap, options = {}) {
    const item = {
      // 原始数据
      rawData: row,
      rowIndex: row._rowIndex,

      // 标准化字段
      name: this.cleanText(row[columnMap.name] || ""),
      price: this.parsePrice(row[columnMap.price]),
      quantity: this.parseQuantity(row[columnMap.quantity]),
      unit: this.cleanText(row[columnMap.unit] || ""),
      supplier: this.cleanText(row[columnMap.supplier] || ""),
      specification: this.cleanText(row[columnMap.specification] || ""),
      note: this.cleanText(row[columnMap.note] || ""),

      // 提取的特征
      features: this.extractFeatures(row[columnMap.name] || ""),

      // 处理时间戳
      processedAt: new Date(),
    }

    return item
  }

  /**
   * 验证数据项
   * @param {Object} item 数据项
   * @returns {Object} 验证结果
   */
  validateDataItem(item) {
    const errors = []

    // 商品名称必需
    if (!item.name || item.name.trim().length === 0) {
      errors.push("商品名称不能为空")
    }

    // 价格验证
    if (item.price !== null && (isNaN(item.price) || item.price < 0)) {
      errors.push("价格格式不正确或为负数")
    }

    // 数量验证
    if (item.quantity !== null && (isNaN(item.quantity) || item.quantity < 0)) {
      errors.push("数量格式不正确或为负数")
    }

    // 商品名称长度限制
    if (item.name && item.name.length > 200) {
      errors.push("商品名称过长（超过200个字符）")
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * 提取商品特征
   * @param {string} name 商品名称
   * @returns {Object} 提取的特征
   */
  extractFeatures(name) {
    if (!name) return {}

    const features = {}
    const normalizedName = name.toLowerCase().trim()

    // 提取品牌
    const brands = [
      "中华",
      "玉溪",
      "云烟",
      "黄金叶",
      "白沙",
      "芙蓉王",
      "利群",
      "苏烟",
    ]
    features.brand = brands.find((brand) =>
      normalizedName.includes(brand.toLowerCase())
    )

    // 提取包装类型
    if (normalizedName.includes("硬")) features.packageType = "硬盒"
    else if (normalizedName.includes("软")) features.packageType = "软盒"

    // 提取规格
    const sizeMatches = normalizedName.match(/(\d+)支/)
    if (sizeMatches) {
      features.size = `${sizeMatches[1]}支`
    }

    // 提取关键词
    const keywords = []
    if (normalizedName.includes("细")) keywords.push("细支")
    if (normalizedName.includes("中支")) keywords.push("中支")
    if (normalizedName.includes("粗")) keywords.push("粗支")
    if (normalizedName.includes("条")) keywords.push("条装")

    features.keywords = keywords

    return features
  }

  /**
   * 清理文本
   * @param {string} text 原始文本
   * @returns {string} 清理后的文本
   */
  cleanText(text) {
    if (!text) return ""

    return text
      .toString()
      .trim()
      .replace(/\s+/g, " ") // 多个空格替换为单个空格
      .replace(/[\r\n\t]/g, "") // 移除换行符和制表符
  }

  /**
   * 解析价格
   * @param {any} value 价格值
   * @returns {number|null} 解析后的价格
   */
  parsePrice(value) {
    if (!value || value === "") return null

    // 移除货币符号和空格
    const cleanValue = value.toString().replace(/[￥$¥,\s]/g, "")

    const price = parseFloat(cleanValue)
    return isNaN(price) ? null : price
  }

  /**
   * 解析数量
   * @param {any} value 数量值
   * @returns {number|null} 解析后的数量
   */
  parseQuantity(value) {
    if (!value || value === "") return null

    const quantity = parseInt(value)
    return isNaN(quantity) ? null : quantity
  }

  /**
   * 生成解析报告
   * @param {Array} rawData 原始数据
   * @param {Object} processedData 处理后数据
   * @returns {Object} 解析报告
   */
  generateParseReport(rawData, processedData) {
    const report = {
      summary: {
        totalRows: rawData.length,
        validRows: processedData.validItems.length,
        errorRows: processedData.errorItems.length,
        successRate:
          rawData.length > 0
            ? Math.round(
                (processedData.validItems.length / rawData.length) * 100
              )
            : 0,
      },

      fieldAnalysis: this.analyzeFields(processedData.validItems),

      errorAnalysis: this.analyzeErrors(processedData.errorItems),

      recommendations: this.generateRecommendations(processedData),
    }

    return report
  }

  /**
   * 分析字段
   * @param {Array} validItems 有效数据项
   * @returns {Object} 字段分析结果
   */
  analyzeFields(validItems) {
    if (validItems.length === 0) return {}

    const analysis = {
      nameField: {
        filled: validItems.filter((item) => item.name).length,
        avgLength:
          validItems.reduce((sum, item) => sum + (item.name?.length || 0), 0) /
          validItems.length,
      },
      priceField: {
        filled: validItems.filter((item) => item.price !== null).length,
        avgPrice:
          validItems
            .filter((item) => item.price !== null)
            .reduce((sum, item) => sum + item.price, 0) /
            validItems.filter((item) => item.price !== null).length || 0,
        priceRange: this.getPriceRange(validItems),
      },
      quantityField: {
        filled: validItems.filter((item) => item.quantity !== null).length,
        totalQuantity: validItems.reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        ),
      },
    }

    return analysis
  }

  /**
   * 分析错误
   * @param {Array} errorItems 错误数据项
   * @returns {Object} 错误分析结果
   */
  analyzeErrors(errorItems) {
    const errorStats = {}

    errorItems.forEach((item) => {
      item.errors.forEach((error) => {
        errorStats[error] = (errorStats[error] || 0) + 1
      })
    })

    return {
      errorTypes: errorStats,
      totalErrors: errorItems.length,
      errorRows: errorItems.map((item) => item.rowIndex),
    }
  }

  /**
   * 生成建议
   * @param {Object} processedData 处理后数据
   * @returns {Array} 建议列表
   */
  generateRecommendations(processedData) {
    const recommendations = []

    // 成功率建议
    const successRate =
      processedData.validItems.length /
      (processedData.validItems.length + processedData.errorItems.length)

    if (successRate < 0.8) {
      recommendations.push({
        type: "data_quality",
        message: "数据质量较低，建议检查原始文件格式和内容",
        priority: "high",
      })
    }

    // 价格字段建议
    const priceFieldCount = processedData.validItems.filter(
      (item) => item.price !== null
    ).length
    if (priceFieldCount < processedData.validItems.length * 0.5) {
      recommendations.push({
        type: "missing_price",
        message: "超过50%的记录缺少价格信息，可能影响匹配精度",
        priority: "medium",
      })
    }

    return recommendations
  }

  /**
   * 获取价格范围
   * @param {Array} validItems 有效数据项
   * @returns {Object} 价格范围
   */
  getPriceRange(validItems) {
    const prices = validItems
      .filter((item) => item.price !== null)
      .map((item) => item.price)

    if (prices.length === 0) return { min: 0, max: 0 }

    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    }
  }
}

module.exports = ExcelParser


