/**
 * PM2 部署配置
 */
module.exports = {
  apps: [
    {
      name: "smart-match-api",
      script: "src/app.js",
      cwd: __dirname,
      instances: "max", // 或指定实例数，如 2
      exec_mode: "cluster",

      // 环境变量
      env: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
        MONGODB_URI: "mongodb://localhost:27017/smartmatch",
        REDIS_HOST: "localhost",
        REDIS_PORT: 6379,
        JWT_SECRET: "your-production-jwt-secret-change-this",
      },

      // 日志配置
      log_file: "./logs/combined.log",
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      time: true,

      // 重启配置
      autorestart: true,
      watch: false, // 生产环境建议关闭文件监控
      max_memory_restart: "1G",
      restart_delay: 4000,

      // 实例配置
      min_uptime: "10s",
      max_restarts: 10,

      // 其他配置
      kill_timeout: 5000,
      listen_timeout: 3000,

      // 环境特定配置
      node_args: process.env.NODE_ENV === "development" ? ["--inspect"] : [],
    },
  ],

  // 部署配置
  deploy: {
    production: {
      user: "deploy",
      host: ["your-server.com"],
      ref: "origin/main",
      repo: "git@github.com:username/smart-match-system.git",
      path: "/opt/smart-match-system",
      "pre-deploy-local": "",
      "post-deploy":
        "npm install && pm2 reload ecosystem.config.js --env production",
      "pre-setup": "",
    },
  },
}


