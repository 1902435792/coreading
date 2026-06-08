const env = {
  CO_READING_SIDECAR_HOST: process.env.CO_READING_SIDECAR_HOST || "127.0.0.1",
  CO_READING_SIDECAR_PORT: process.env.CO_READING_SIDECAR_PORT || "8791"
};

for (const key of ["CO_READING_DATA_DIR", "CO_READING_VENDOR_DIR", "CO_READING_SIDECAR_MAX_BODY_BYTES"]) {
  if (process.env[key]) env[key] = process.env[key];
}

module.exports = {
  apps: [
    {
      name: "vcp-coreading-sidecar",
      script: "CoReadingSidecar.cjs",
      cwd: __dirname,
      interpreter: "node",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env
    }
  ]
};
