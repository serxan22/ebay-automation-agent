import crypto from "crypto";

const algorithm = "aes-256-gcm";

export function encryptSecret(value: string, secret = process.env.ENCRYPTION_SECRET) {
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET is required to encrypt credentials.");
  }

  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string, secret = process.env.ENCRYPTION_SECRET) {
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET is required to decrypt credentials.");
  }

  const [ivBase64, authTagBase64, encryptedBase64] = payload.split(".");

  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Encrypted payload is malformed.");
  }

  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}
