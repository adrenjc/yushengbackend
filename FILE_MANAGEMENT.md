# 文件管理解决方案

## 🚨 问题分析

### 原有问题

1. **日志文件无限累积**

   - 每天生成新的日志文件，从不删除
   - 示例：`logs/2025-08-26.log`, `logs/2025-08-27.log`

2. **临时上传文件残留**

   - 上传失败时可能留下临时文件
   - 没有定期清理机制

3. **潜在后果**
   - 磁盘空间耗尽
   - 文件系统性能下降
   - 备份成本增加
   - 安全风险

## ✅ 解决方案

### 1. 自动文件清理脚本

**文件位置**: `scripts/cleanup-files.js`

**功能特性**:

- 自动删除过期日志文件（默认 30 天）
- 清理临时上传文件（默认 24 小时）
- 生成清理统计报告
- 错误处理和日志记录

**配置项**:

```javascript
const CLEANUP_CONFIG = {
  LOG_RETENTION_DAYS: 30, // 日志保留天数
  TEMP_FILE_RETENTION_HOURS: 24, // 临时文件保留小时数
  UPLOAD_RETENTION_DAYS: 7, // 上传文件保留天数
}
```

### 2. 定时任务服务

**文件位置**: `src/services/scheduler.service.js`

**调度配置**:

- **文件清理**: 每天凌晨 3 点执行
- **健康检查**: 每天早上 8 点执行
- **告警机制**: 文件大小超过阈值时记录警告

### 3. 管理 API 接口

**路由**: `/api/system/*`

**可用接口**:

```
GET  /api/system/status         # 获取系统状态
POST /api/system/cleanup        # 手动执行清理（需要管理员权限）
GET  /api/system/storage-report # 获取存储统计
GET  /api/system/scheduler      # 获取定时任务状态
```

### 4. NPM 脚本命令

```bash
npm run cleanup          # 执行文件清理
npm run cleanup:report   # 查看存储报告
npm run cleanup:dry-run  # 模拟清理（查看将要删除的文件）
```

## 🛠️ 部署说明

### 1. 安装依赖

```bash
cd D:\code\yushengbackend
npm install
```

新增依赖:

- `node-cron`: 定时任务库
- `cron`: 额外的 cron 工具

### 2. 环境变量配置

可选的环境变量:

```env
LOG_RETENTION_DAYS=30
TEMP_FILE_RETENTION_HOURS=24
UPLOAD_RETENTION_DAYS=7
```

### 3. 启动服务

```bash
npm run pm2:start
```

定时任务会自动启动并按计划执行。

## 📊 监控和维护

### 查看清理状态

```bash
# 查看存储使用情况
npm run cleanup:report

# 手动执行清理
npm run cleanup
```

### 日志监控

清理任务的执行情况会记录在系统日志中:

```
[2025-01-XX] [INFO] 开始执行定时文件清理任务
[2025-01-XX] [INFO] 定时文件清理任务完成 {"logsDeleted": 5, "uploadsDeleted": 3, "totalSizeMB": 123.45}
```

### API 监控

通过管理界面或 API 调用监控:

```bash
curl -H "Authorization: Bearer <token>" \
  https://www.yssh.cc/api/system/status
```

## ⚠️ 注意事项

### 1. 文件权限

确保 Node.js 进程有足够权限删除文件:

```bash
chmod 755 uploads/
chmod 755 logs/
```

### 2. 备份策略

在清理前确保重要文件已备份:

- 数据库定期备份
- 配置文件版本控制
- 重要上传文件单独存储

### 3. 监控告警

建议设置监控:

- 磁盘使用率超过 80%时告警
- 文件清理失败时通知
- 定时任务异常时告警

## 🔧 自定义配置

### 修改清理策略

编辑 `scripts/cleanup-files.js`:

```javascript
const CLEANUP_CONFIG = {
  LOG_RETENTION_DAYS: 60, // 改为60天
  // ...其他配置
}
```

### 添加自定义清理规则

在 `cleanupTempFiles` 函数中添加:

```javascript
// 清理特定类型的文件
if (file.startsWith("custom-prefix-")) {
  // 自定义清理逻辑
}
```

### 修改定时任务

编辑 `src/services/scheduler.service.js`:

```javascript
// 改为每12小时执行一次
const cleanupTask = cron.schedule("0 */12 * * *", async () => {
  // ...
})
```

## 📈 效果预期

实施后预期效果:

- **磁盘使用稳定**: 文件大小保持在合理范围
- **性能提升**: 减少不必要的文件 I/O
- **运维简化**: 自动化文件管理
- **安全提升**: 及时清理敏感临时文件

## 🆘 故障排查

### 清理失败

检查错误日志:

```bash
npm run pm2:logs
```

常见问题:

- 文件权限不足
- 磁盘空间不足
- 文件被其他进程占用

### 定时任务未执行

检查调度器状态:

```bash
curl -H "Authorization: Bearer <token>" \
  https://www.yssh.cc/api/system/scheduler
```

### 手动恢复

如果自动清理失败，可以手动执行:

```bash
# 手动清理
npm run cleanup

# 查看具体文件
ls -la uploads/
ls -la logs/
```
