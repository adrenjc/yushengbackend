# PM2 生产环境部署指南

## 📋 概述

本项目使用单一的 PM2 配置文件 `ecosystem.config.js`，专门针对生产环境优化。本地开发使用 `npm run dev` 即可。

## 🚀 特性

### 性能优化

- **集群模式**: 自动使用所有 CPU 核心
- **内存管理**: 2GB 内存限制，自动重启
- **GC 优化**: 优化垃圾回收策略
- **负载均衡**: 自动端口分配

### 可靠性保障

- **优雅重启**: 支持零停机重启
- **健康检查**: HTTP 健康检查
- **指数退避**: 智能重启策略
- **日志轮转**: 自动管理日志文件

## 📁 日志管理

PM2 会自动创建以下日志文件：

```
logs/
├── pm2-error.log      # 错误日志
├── pm2-out.log        # 标准输出
├── pm2-combined.log   # 合并日志
└── ...                # 轮转的历史日志
```

**日志特性**：

- JSON 格式便于分析
- 自动轮转（保留 10 个文件）
- 时间戳格式化
- 合并多进程日志

## 🛠️ 使用命令

### 基本操作

```bash
# 启动服务
npm run pm2:start

# 停止服务
npm run pm2:stop

# 重启服务（零停机）
npm run pm2:restart

# 删除服务
npm run pm2:delete

# 查看日志
npm run pm2:logs

# 监控面板
npm run pm2:monit
```

### 高级操作

```bash
# 重载配置（零停机）
pm2 reload ecosystem.config.js

# 查看详细状态
pm2 show smart-match-api

# 查看实时日志
pm2 logs smart-match-api --lines 50

# 查看内存使用
pm2 monit

# 保存PM2进程列表
pm2 save

# 开机自启动
pm2 startup
pm2 save
```

## ⚙️ 配置说明

### 核心配置

```javascript
{
  instances: "max",           // 使用所有CPU核心
  exec_mode: "cluster",       // 集群模式
  max_memory_restart: "2G",   // 内存限制
  NODE_ENV: "production",     // 生产环境
  PORT: 8080                  // 服务端口
}
```

### 性能参数

```javascript
node_args: [
  "--max-old-space-size=1536", // 1.5GB内存限制
  "--optimize-for-size", // 优化内存使用
  "--max-http-header-size=8192", // HTTP头限制
  "--gc-interval=200", // GC频率
]
```

### 重启策略

```javascript
{
  max_restarts: 15,              // 最大重启次数
  min_uptime: "30s",             // 最小运行时间
  exp_backoff_restart_delay: 100, // 指数退避
  restart_delay: 1000            // 重启延迟
}
```

## 🔧 环境变量

可以通过 `.env` 文件或环境变量覆盖默认配置：

```env
NODE_ENV=production
PORT=8080
MONGODB_URI=mongodb://localhost:27017/smartmatch
JWT_SECRET=your-production-secret
LOG_LEVEL=info
```

## 📊 监控指标

### 关键指标

- **CPU 使用率**: 应保持在 70%以下
- **内存使用**: 不超过 2GB 限制
- **重启次数**: 频繁重启需要调查
- **响应时间**: 通过日志分析

### 监控命令

```bash
# 实时监控
pm2 monit

# 状态概览
pm2 status

# 详细信息
pm2 show smart-match-api

# 日志分析
pm2 logs smart-match-api | grep "ERROR"
```

## 🚨 故障排查

### 常见问题

1. **服务无法启动**

   ```bash
   # 检查日志
   pm2 logs smart-match-api --err

   # 检查端口占用
   netstat -tulpn | grep :8080
   ```

2. **内存泄漏**

   ```bash
   # 监控内存使用
   pm2 monit

   # 强制重启
   pm2 restart smart-match-api
   ```

3. **频繁重启**

   ```bash
   # 查看重启历史
   pm2 show smart-match-api

   # 检查错误日志
   pm2 logs smart-match-api --err --lines 100
   ```

### 性能调优

1. **调整实例数量**

   ```javascript
   instances: 4,  // 固定4个实例而不是"max"
   ```

2. **调整内存限制**

   ```javascript
   max_memory_restart: "1G",  // 降低到1GB
   ```

3. **调整 GC 参数**
   ```javascript
   node_args: ["--max-old-space-size=1024", "--gc-interval=100"]
   ```

## 🔄 更新部署

### 标准更新流程

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖
npm install

# 3. 运行清理
npm run cleanup

# 4. 零停机重启
pm2 reload ecosystem.config.js
```

### 回滚流程

```bash
# 1. 回退代码
git checkout <previous-commit>

# 2. 重启服务
pm2 restart smart-match-api
```

## 🎯 最佳实践

1. **定期监控**: 每天检查服务状态和日志
2. **及时更新**: 定期更新依赖和安全补丁
3. **备份配置**: 将 PM2 进程列表保存到文件
4. **监控告警**: 设置内存和 CPU 使用率告警
5. **日志分析**: 定期分析错误日志和性能指标

## 📈 扩展配置

如需要更多实例或特殊配置，可以修改 `ecosystem.config.js`：

```javascript
// 多应用配置示例
module.exports = {
  apps: [
    {
      name: "smart-match-api",
      // ... 主应用配置
    },
    {
      name: "smart-match-worker",
      script: "src/worker.js",
      instances: 2,
      // ... 工作进程配置
    },
  ],
}
```

通过合理配置和监控，PM2 可以确保您的智能商品匹配系统在生产环境中稳定、高效地运行。
