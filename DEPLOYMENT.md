# 智能商品匹配系统部署指南

## 📋 配置清单

### 1. 域名配置

✅ **已完成**：nginx 配置已更新为 `yssh.cc`

- 主域名：`www.yssh.cc`
- 裸域名：`yssh.cc` (自动跳转到 www)

### 2. 端口配置

✅ **已完成**：后端端口已改为 `8080`

- 后端服务：`http://localhost:8080`
- 前端静态文件通过 nginx 服务

### 3. SSL 证书

需要配置 SSL 证书文件：

```
C:/nginx/ssl/yssh.cc.pem     # 证书文件
C:/nginx/ssl/yssh.cc.key     # 私钥文件
```

## 🚀 部署步骤

### 后端部署

1. **创建环境变量文件**：

```bash
# 在后端目录创建 .env 文件
cd D:\code\yushengbackend
cp env.production.template .env
```

2. **修改环境变量**：

```env
NODE_ENV=production
PORT=8080
MONGODB_URI=mongodb://localhost:27017/smartmatch
JWT_SECRET=your-secure-jwt-secret-here
```

3. **安装依赖并启动**：

```bash
npm install
npm run pm2:start
```

PM2 配置已优化为生产环境专用，包含集群模式、内存管理和性能优化。详细配置请参考 `PM2_GUIDE.md`。

### 前端部署

1. **构建静态文件**：

```bash
cd D:\code\yushengfrontend
npm install
npm run build
```

2. **构建后的文件位置**：
   - 输出目录：`D:\code\yushengfrontend\out`
   - nginx 已配置指向此目录

### Nginx 配置

1. **复制配置文件**：

```bash
# 将 nginx.conf 复制到nginx安装目录
cp D:\code\yushengbackend\nginx.conf C:\nginx\conf\nginx.conf
```

2. **重启 nginx**：

```bash
nginx -s reload
```

### PM2 进程管理

详细的 PM2 使用说明请参考 `PM2_GUIDE.md`

```bash
# 查看服务状态
npm run pm2:monit

# 查看日志
npm run pm2:logs

# 零停机重启
pm2 reload ecosystem.config.js
```

## 🔧 访问地址

部署完成后，可通过以下地址访问：

- **主站**：https://www.yssh.cc
- **API 健康检查**：https://www.yssh.cc/health
- **API 文档**：https://www.yssh.cc/api

## 🛠️ 故障排查

### 后端服务检查

```bash
# 检查服务状态
npm run pm2:logs

# 检查端口占用
netstat -ano | findstr :8080
```

### 前端构建检查

```bash
# 检查构建输出
ls D:\code\yushengfrontend\out

# 重新构建
npm run build
```

### Nginx 检查

```bash
# 检查配置语法
nginx -t

# 查看错误日志
tail -f C:\nginx\logs\error.log
```

## 📁 目录结构

```
服务器部署结构：
├── D:\code\yushengbackend\     # 后端代码
│   ├── src\                   # 源代码
│   ├── uploads\               # 上传文件 (自动创建)
│   ├── logs\                  # 日志文件 (自动创建)
│   └── nginx.conf             # Nginx配置文件
├── D:\code\yushengfrontend\    # 前端代码
│   └── out\                   # 构建输出 (nginx指向)
└── C:\nginx\                  # Nginx安装目录
    ├── conf\nginx.conf        # 主配置文件
    └── ssl\                   # SSL证书目录
        ├── yssh.cc.pem
        └── yssh.cc.key
```

## 🔄 更新部署

### 标准更新流程

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖
npm install

# 3. 运行清理任务
npm run cleanup

# 4. 零停机重启
pm2 reload ecosystem.config.js
```

## ⚠️ 注意事项

1. **端口访问**：确保服务器防火墙开放 80、443、8080 端口
2. **SSL 证书**：确保 SSL 证书文件路径正确且有效
3. **数据库**：确保 MongoDB 服务正常运行
4. **权限**：确保 nginx 和 node 进程有足够的文件读写权限
5. **文件清理**：定时任务会自动清理过期文件，详见 `FILE_MANAGEMENT.md`
6. **PM2 配置**：单一配置文件适用于生产环境，本地开发使用 `npm run dev`
