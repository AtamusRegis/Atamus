// Central configuration, read from environment variables.
// Values are set in /opt/atamus/server.env on the server (see scripts/setup.sh).

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

// Comma-separated list of origins allowed to call the API with credentials.
const origins = (process.env.ALLOWED_ORIGINS ||
  "https://atamus.io,https://www.atamus.io")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || "8080", 10),
  databaseUrl: required("DATABASE_URL"),
  allowedOrigins: origins,
  isProd: process.env.NODE_ENV === "production",

  // How long a login session lasts.
  sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS || "30", 10),
  // How long a password-recovery attempt token is valid.
  recoveryTtlMinutes: parseInt(process.env.RECOVERY_TTL_MINUTES || "15", 10),
};
