const env = {
  CO_READING_SIDECAR_HOST: process.env.CO_READING_SIDECAR_HOST || "127.0.0.1",
  CO_READING_SIDECAR_PORT: process.env.CO_READING_SIDECAR_PORT || "8791"
};

for (const key of [
  "VCP_API_KEY",
  "CO_READING_DATA_DIR",
  "CO_READING_VENDOR_DIR",
  "CO_READING_SIDECAR_MAX_BODY_BYTES",
  "CO_READING_NOVA_API_KEY",
  "CO_READING_NOVA_BACKENDS",
  "CO_READING_NOVA_BRIDGE_URL",
  "CO_READING_NOVA_AGENT_URL",
  "CO_READING_NOVA_AGENT_NAME",
  "CO_READING_NOVA_AGENT_MAID",
  "CO_READING_NOVA_AGENT_SESSION",
  "CO_READING_NOVA_AGENT_SESSION_SCOPE",
  "CO_READING_NOVA_AGENT_INJECT_TOOLS",
  "CO_READING_NOVA_MODEL",
  "CO_READING_NOVA_TIMEOUT_MS",
  "CO_READING_NOVA_GUIDE_PATH",
  "CO_READING_NOVA_SKILL_PROMPTS_DIR"
]) {
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
