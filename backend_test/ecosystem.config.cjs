module.exports = {
  apps: [
    {
      name: "kirkahoot-backend",
      script: "server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
