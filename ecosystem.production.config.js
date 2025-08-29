/**
 * PM2 生产环境配置
 * 用于管理 Node.js 应用进程
 */

module.exports = {
  apps: [
    {
      name: "smart-match-api",
      script: "./src/app.js",

      // 运行环境
      env: {
        NODE_ENV: "development",
        PORT: 3002,
      },

      // 生产环境配置
      env_production: {
        NODE_ENV: "production",
        PORT: 3002,

        // 数据库配置
        MONGODB_URI: "mongodb://localhost:27017/smart-match-prod",

        // Redis 配置
        REDIS_HOST: "localhost",
        REDIS_PORT: 6379,
        REDIS_PASSWORD: "", // 生产环境请设置密码

        // JWT 配置
        JWT_SECRET: "your-super-secret-jwt-key-change-in-production",
        JWT_EXPIRES_IN: "7d",

        // 文件上传配置（Windows路径）
        UPLOAD_DIR: "C:\\inetpub\\wwwroot\\smart-match\\uploads",
        MAX_FILE_SIZE: "10MB",

        // 日志配置（Windows路径）
        LOG_LEVEL: "info",
        LOG_DIR: "C:\\logs\\smart-match",

        // 安全配置
        CORS_ORIGINS: "https://your-domain.com,https://www.your-domain.com",

        // 性能配置
        MAX_REQUEST_SIZE: "50mb",
        REQUEST_TIMEOUT: "30s",
      },

      // PM2 进程配置
      instances: "max", // 启动 CPU 核心数量的实例
      exec_mode: "cluster", // 集群模式

      // 内存和重启配置
      max_memory_restart: "1G", // 内存超过1G自动重启
      node_args: "--max-old-space-size=1024", // Node.js 内存限制

      // 日志配置（Windows路径）
      log_file: "C:\\logs\\smart-match\\combined.log",
      out_file: "C:\\logs\\smart-match\\out.log",
      error_file: "C:\\logs\\smart-match\\error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // 自动重启配置
      autorestart: true,
      watch: false, // 生产环境不启用文件监听
      max_restarts: 10,
      min_uptime: "10s",

      // 启动延迟
      restart_delay: 4000,

      // 健康检查
      health_check_url: "http://localhost:3002/api/health",
      health_check_grace_period: 3000,

      // 进程管理
      kill_timeout: 5000,
      listen_timeout: 3000,

      // 环境变量
      source_map_support: true,
      instance_var: "INSTANCE_ID",
    },
  ],

  // 部署配置（Windows版本）
  deploy: {
    production: {
      user: "Administrator",
      host: "your-server-ip",
      ref: "origin/main",
      repo: "git@github.com:username/smart-match-system.git",
      path: "C:\\inetpub\\wwwroot\\smart-match-api",

      // 部署前脚本
      "pre-deploy-local": "",

      // 部署后脚本（Windows命令）
      "post-deploy":
        "npm install && pm2 reload ecosystem.production.config.js --env production",

      // 设置（Windows命令）
      "pre-setup": "",
      "post-setup": "dir",
    },
  },
}
