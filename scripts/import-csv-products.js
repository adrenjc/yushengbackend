/**
 * CSV商品数据导入脚本
 * 支持导入新字段结构的商品数据
 */
const mongoose = require("mongoose")
const fs = require("fs")
const csv = require("csv-parser")
const path = require("path")
const Product = require("../src/models/Product")
const ProductTemplate = require("../src/models/ProductTemplate")
const config = require("../src/config/env")

// CSV字段映射配置
const CSV_FIELD_MAPPING = {
  商品名称: "name",
  公司价: "companyPrice", // 新增公司价字段映射
  品牌: "brand",
  产品编码: "productCode",
  盒码编码: "boxCode",
  产品类型: "productType",
  包装类型: "packageType",
  "烟支周长(mm)": "circumference",
  烟支长度: "length",
  包装数量: "packageQuantity",
  上市时间: "launchDate",
  "焦油含量(mg)": "tarContent",
  "烟气烟碱量(mg)": "nicotineContent",
  "烟气一氧化碳量(mg)": "carbonMonoxideContent",
  颜色: "color",
  所属企业: "company",
  是否爆珠: "hasPop",
  价格类型: "priceCategory",
  零售价: "retailPrice",
  单位: "unit",
}

/**
 * 解析CSV行数据为Product对象
 */
function parseCSVRow(row, templateId) {
  const product = {
    templateId,
    name: row["商品名称"]?.trim(),
    brand: row["品牌"]?.trim(),
    productCode: row["产品编码"]?.trim(),
    boxCode: row["盒码编码"]?.trim(),
    productType: row["产品类型"]?.trim(),
    packageType: row["包装类型"]?.trim(),

    specifications: {
      circumference: parseFloat(row["烟支周长(mm)"]) || null,
      length: row["烟支长度"]?.trim(),
      packageQuantity: parseFloat(row["包装数量"]) || null,
    },

    launchDate: parseDate(row["上市时间"]),

    chemicalContent: {
      tarContent: parseFloat(row["焦油含量(mg)"]) || null,
      nicotineContent: parseFloat(row["烟气烟碱量(mg)"]) || null,
      carbonMonoxideContent: parseFloat(row["烟气一氧化碳量(mg)"]) || null,
    },

    appearance: {
      color: row["颜色"]?.trim(),
    },

    company: row["所属企业"]?.trim(),

    features: {
      hasPop: parseBooleanFromChinese(row["是否爆珠"]),
    },

    pricing: {
      priceCategory: row["价格类型"]?.trim(),
      companyPrice: parseFloat(row["公司价"]) || null, // 新增公司价解析
      retailPrice: parseFloat(row["零售价"]) || null,
      unit: row["单位"]?.trim() || "元/条",
    },

    metadata: {
      source: "import",
      importBatch: new Date().toISOString().split("T")[0],
    },

    isActive: true,
  }

  // 清理空值
  Object.keys(product.specifications).forEach((key) => {
    if (
      product.specifications[key] === null ||
      product.specifications[key] === undefined
    ) {
      delete product.specifications[key]
    }
  })

  Object.keys(product.chemicalContent).forEach((key) => {
    if (
      product.chemicalContent[key] === null ||
      product.chemicalContent[key] === undefined
    ) {
      delete product.chemicalContent[key]
    }
  })

  Object.keys(product.pricing).forEach((key) => {
    if (product.pricing[key] === null || product.pricing[key] === undefined) {
      delete product.pricing[key]
    }
  })

  return product
}

/**
 * 解析日期字符串
 */
function parseDate(dateStr) {
  if (!dateStr) return null

  // 尝试解析 YYYY-MM-DD 格式
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

/**
 * 解析中文布尔值
 */
function parseBooleanFromChinese(value) {
  if (!value) return false
  const str = value.toString().trim()
  return str === "是" || str === "true" || str === "1"
}

/**
 * 验证商品数据
 */
function validateProduct(product, rowIndex) {
  const errors = []

  if (!product.name) {
    errors.push(`第${rowIndex + 1}行: 商品名称不能为空`)
  }

  if (!product.brand) {
    errors.push(`第${rowIndex + 1}行: 品牌不能为空`)
  }

  if (product.pricing?.retailPrice && product.pricing.retailPrice < 0) {
    errors.push(`第${rowIndex + 1}行: 零售价不能为负数`)
  }

  return errors
}

/**
 * 导入CSV文件
 */
async function importCSV(csvFilePath, templateId, options = {}) {
  const { batchSize = 100, skipErrors = false, dryRun = false } = options

  return new Promise((resolve, reject) => {
    const products = []
    const errors = []
    let rowIndex = 0

    console.log(`📖 读取CSV文件: ${csvFilePath}`)

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          const product = parseCSVRow(row, templateId)
          const validationErrors = validateProduct(product, rowIndex)

          if (validationErrors.length > 0) {
            errors.push(...validationErrors)
            if (!skipErrors) {
              return
            }
          } else {
            products.push(product)
          }

          rowIndex++
        } catch (error) {
          errors.push(`第${rowIndex + 1}行: 解析出错 - ${error.message}`)
          rowIndex++
        }
      })
      .on("end", async () => {
        try {
          console.log(
            `📊 解析完成: 共${rowIndex}行数据, 有效商品${products.length}个`
          )

          if (errors.length > 0) {
            console.log(`⚠️  发现${errors.length}个错误:`)
            errors.forEach((error) => console.log(`   ${error}`))

            if (!skipErrors) {
              return reject(new Error("数据验证失败"))
            }
          }

          if (dryRun) {
            console.log("🔍 试运行模式，不实际导入数据")
            return resolve({
              totalRows: rowIndex,
              validProducts: products.length,
              errors: errors.length,
              products: products.slice(0, 5), // 返回前5个作为示例
            })
          }

          console.log("💾 开始导入数据库...")

          let imported = 0
          for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize)
            await Product.insertMany(batch, { ordered: false })
            imported += batch.length
            console.log(`   已导入 ${imported}/${products.length} 个商品`)
          }

          resolve({
            totalRows: rowIndex,
            imported,
            errors: errors.length,
          })
        } catch (error) {
          reject(error)
        }
      })
      .on("error", reject)
  })
}

/**
 * 主函数
 */
async function main() {
  try {
    const csvFile = process.argv[2]
    const templateName = process.argv[3] || "默认商品模板"
    const dryRun = process.argv.includes("--dry-run")
    const skipErrors = process.argv.includes("--skip-errors")

    if (!csvFile) {
      console.log("❌ 请指定CSV文件路径")
      console.log(
        "用法: node scripts/import-csv-products.js <CSV文件路径> [模板名称] [--dry-run] [--skip-errors]"
      )
      process.exit(1)
    }

    if (!fs.existsSync(csvFile)) {
      console.log("❌ CSV文件不存在:", csvFile)
      process.exit(1)
    }

    console.log("🔗 连接数据库...")
    await mongoose.connect(config.MONGODB_URI)
    console.log("✅ 数据库连接成功")

    // 查找或创建模板
    let template = await ProductTemplate.findOne({ name: templateName })
    if (!template) {
      console.log(`📋 创建新模板: ${templateName}`)
      template = new ProductTemplate({
        name: templateName,
        description: "从CSV导入创建的模板",
        category: "导入模板",
        createdBy: "000000000000000000000000", // 使用默认系统用户ID
      })
      await template.save()
    }

    console.log(`📋 使用模板: ${template.name} (${template._id})`)

    // 导入CSV
    const result = await importCSV(csvFile, template._id, {
      dryRun,
      skipErrors,
      batchSize: 100,
    })

    console.log("\n✨ 导入完成!")
    console.log(`   - 总行数: ${result.totalRows}`)
    console.log(`   - 导入成功: ${result.imported || result.validProducts}`)
    console.log(`   - 错误数量: ${result.errors}`)

    if (dryRun && result.products) {
      console.log("\n📋 示例数据:")
      result.products.forEach((product, index) => {
        console.log(
          `   ${index + 1}. ${product.brand} ${product.name} - ¥${
            product.pricing?.retailPrice
          }`
        )
      })
    }
  } catch (error) {
    console.error("❌ 导入失败:", error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log("🔌 已断开数据库连接")
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = {
  importCSV,
  parseCSVRow,
  CSV_FIELD_MAPPING,
}
