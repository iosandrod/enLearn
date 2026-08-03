import {
  __name,
  init_esm
} from "./chunk-VDUEJNM7.mjs";

// src/workflow/trigger/trigger-credentials.crypto.ts
init_esm();
import crypto from "node:crypto";
function decryptPersonalAccessToken(row, key) {
  if (!isEncryptedToken(row.encryptedToken)) {
    throw new Error(`Trigger.dev PAT ${row.id} has invalid encrypted data.`);
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "utf8"),
    Buffer.from(row.encryptedToken.nonce, "hex")
  );
  decipher.setAuthTag(Buffer.from(row.encryptedToken.tag, "hex"));
  let token = decipher.update(row.encryptedToken.ciphertext, "hex", "utf8");
  token += decipher.final("utf8");
  if (!token.startsWith("tr_pat_") || hashToken(token) !== row.hashedToken) {
    throw new Error(`Trigger.dev PAT ${row.id} failed validation.`);
  }
  return token;
}
__name(decryptPersonalAccessToken, "decryptPersonalAccessToken");
function encryptToken(value, key) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "utf8"), nonce);
  let ciphertext = cipher.update(value, "utf8", "hex");
  ciphertext += cipher.final("hex");
  return {
    nonce: nonce.toString("hex"),
    ciphertext,
    tag: cipher.getAuthTag().toString("hex")
  };
}
__name(encryptToken, "encryptToken");
function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
__name(hashToken, "hashToken");
function isEncryptedToken(value) {
  return typeof value === "object" && value !== null && typeof value.nonce === "string" && typeof value.ciphertext === "string" && typeof value.tag === "string";
}
__name(isEncryptedToken, "isEncryptedToken");

export {
  decryptPersonalAccessToken,
  encryptToken,
  hashToken
};
//# sourceMappingURL=chunk-TDNREOVY.mjs.map
