# MongoDB 快速安装和配置指南

## 🚀 快速安装方法

### 方法 1: 官方安装包 (推荐)

1. **下载 MongoDB Community Server**

   - 访问: https://www.mongodb.com/try/download/community
   - 选择 Windows 版本，下载 MSI 安装包

2. **安装 MongoDB**

   ```
   - 运行下载的MSI文件
   - 选择"Complete"完整安装
   - 勾选"Install MongoDB as a Service"
   - 创建数据目录: C:\data\db
   ```

3. **启动 MongoDB 服务**

   ```powershell
   # 作为Windows服务启动
   net start MongoDB

   # 或者手动启动
   mongod --dbpath C:\data\db
   ```

### 方法 2: 便携版安装

1. **下载 ZIP 包**

   - 下载 MongoDB Community Server 的 ZIP 版本
   - 解压到 `C:\mongodb\`

2. **创建数据目录**

   ```powershell
   mkdir C:\data\db
   ```

3. **启动 MongoDB**
   ```powershell
   C:\mongodb\bin\mongod.exe --dbpath C:\data\db
   ```

## 🔧 验证安装

1. **检查 MongoDB 是否运行**

   ```powershell
   # 检查进程
   tasklist | findstr mongod

   # 检查端口
   netstat -an | findstr :27017
   ```

2. **连接测试**
   ```powershell
   # 使用MongoDB Shell连接
   mongo
   # 或新版本
   mongosh
   ```

## ⚡ 快速启动项目

安装完 MongoDB 后，运行以下命令初始化项目：

```powershell
# 1. 初始化数据库（创建默认模板）
npm run init-db

# 2. 启动后端服务
npm run dev
```

## 🗃️ 数据库信息

- **数据库名称**: smartmatch
- **连接地址**: mongodb://localhost:27017/smartmatch
- **数据目录**: C:\data\db (默认)

## 🔍 故障排除

### MongoDB 无法启动

```powershell
# 检查数据目录权限
icacls C:\data\db

# 查看MongoDB日志
mongod --dbpath C:\data\db --logpath C:\data\log\mongod.log
```

### 端口冲突

```powershell
# 查看占用27017端口的进程
netstat -ano | findstr :27017

# 停止MongoDB服务
net stop MongoDB
```

### 权限问题

```powershell
# 以管理员身份运行PowerShell
# 给当前用户数据目录权限
icacls C:\data\db /grant %USERNAME%:F
```

## 📊 MongoDB 管理工具

推荐使用以下工具管理 MongoDB 数据库：

1. **MongoDB Compass** (官方 GUI 工具)

   - 下载: https://www.mongodb.com/products/compass
   - 可视化数据库管理界面

2. **Studio 3T** (第三方工具)

   - 功能更丰富的数据库管理工具

3. **命令行工具**
   ```powershell
   # MongoDB Shell
   mongosh mongodb://localhost:27017/smartmatch
   ```

## 🎯 下一步

安装完成后：

1. 运行 `npm run init-db` 初始化数据库
2. 访问前端页面: http://localhost:3000/dashboard/templates
3. 开始创建和管理商品模板！

---

**需要帮助？**

- 查看 MongoDB 官方文档: https://docs.mongodb.com/
- 或联系开发团队获取支持
