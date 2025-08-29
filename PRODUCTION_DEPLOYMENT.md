# 🚀 后端生产环境部署指南

## 📋 环境配置

### 🎯 不同环境的启动方式

#### 🔧 开发环境

```bash
# 直接启动（单进程，热重载）
npm run dev

# 使用PM2启动开发环境（支持监控）
npm run pm2:dev
```

#### 🌐 生产环境

```bash
# 使用PM2启动生产环境（推荐）
npm run prod

# 或者直接使用PM2命令
npm run pm2:start

# 单进程生产启动（不推荐）
npm run start:prod
```

## 🛠️ 完整部署流程

### 1️⃣ 首次部署

```bash
# 1. 安装依赖
npm install

# 2. 安装cross-env（如果需要）
npm install --save-dev cross-env

# 3. 初始化数据库
npm run setup

# 4. 启动生产环境
npm run prod
```

### 2️⃣ 更新部署

```bash
# 快速更新部署
npm run deploy:update

# 或者手动步骤：
git pull
npm install
npm run pm2:reload
```

## 🔍 PM2 管理命令

### 📊 监控和日志

```bash
# 查看运行状态
npm run pm2:monit

# 查看日志
npm run pm2:logs

# 查看进程列表
pm2 list
```

### ⚡ 进程管理

```bash
# 重启服务
npm run pm2:restart

# 优雅重载（零停机）
npm run pm2:reload

# 停止服务
npm run pm2:stop

# 删除进程
npm run pm2:delete
```

## 🎯 生产环境特性

### ✅ 生产环境配置

- **多进程集群**：自动使用所有 CPU 核心
- **自动重启**：进程崩溃自动重启
- **内存监控**：超过 2GB 自动重启
- **优雅关闭**：支持零停机更新
- **日志管理**：结构化日志记录
- **性能优化**：内存和 GC 优化

### 📝 环境变量

```bash
NODE_ENV=production
PORT=8080
```

### 🔧 PM2 配置亮点

```javascript
{
  instances: "max",           // 使用所有CPU核心
  exec_mode: "cluster",       // 集群模式
  max_memory_restart: "2G",   // 内存限制
  autorestart: true,          // 自动重启
  watch: false,               // 生产环境关闭文件监控
}
```

## 🌐 nginx 配置确认

确保 nginx 正确代理到后端：

```nginx
upstream smart_match_backend {
    server 127.0.0.1:8080;
}

location /api/ {
    proxy_pass http://smart_match_backend;
    # ... 其他配置
}
```

## 🔍 故障排查

### 检查服务状态

```bash
# 检查进程是否运行
pm2 list

# 检查端口占用
netstat -tulpn | grep :8080

# 查看详细日志
tail -f logs/combined.log
```

### 常见问题解决

1. **端口被占用**

   ```bash
   # 查找占用进程
   lsof -i :8080
   # 杀死进程
   kill -9 <PID>
   ```

2. **内存不足**

   ```bash
   # 查看内存使用
   free -h
   # 调整PM2内存限制
   # 编辑 ecosystem.config.js 中的 max_memory_restart
   ```

3. **数据库连接失败**
   ```bash
   # 检查MongoDB状态
   sudo systemctl status mongod
   # 检查Redis状态
   sudo systemctl status redis
   ```

## 📈 性能优化建议

### 🚀 生产环境优化

1. **使用 PM2 集群模式**：充分利用多核 CPU
2. **设置合理的内存限制**：避免内存泄漏
3. **配置日志轮转**：防止日志文件过大
4. **监控资源使用**：定期检查 CPU 和内存
5. **定期重启**：可配置定时重启策略

### 📊 监控建议

```bash
# 设置PM2持久化
pm2 startup
pm2 save

# 安装PM2监控（可选）
pm2 install pm2-server-monit
```

## 🔐 安全注意事项

1. **环境变量安全**：敏感信息使用环境变量
2. **文件权限**：确保日志目录权限正确
3. **进程用户**：使用非 root 用户运行
4. **防火墙配置**：只开放必要端口
5. **SSL 证书**：确保 nginx SSL 配置正确

---

## 🎉 快速启动命令

```bash
# 🔥 生产环境一键启动
npm run prod

# 📊 查看运行状态
npm run pm2:monit

# 📝 查看日志
npm run pm2:logs
```
