export function getOptionalEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export function getAppUrl() {
  return getOptionalEnv("APP_URL") ?? "http://localhost:3000";
}

export function assertServerEnv(names: string[]) {
  const missing = names.filter((name) => !getOptionalEnv(name));

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
