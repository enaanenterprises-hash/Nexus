import "server-only"
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * Per-user connector credentials, encrypted with AES-256-GCM.
 *
 * Key: `NEXUS_CREDENTIALS_KEY` (32 random bytes, base64). Without it the key
 * is derived from AUTH_SECRET with HKDF, so local setups need nothing extra;
 * set the dedicated key in production so rotating AUTH_SECRET does not lock
 * every stored credential. The key id is stored with each ciphertext.
 */

type KeyId = "ck" | "as"

export class VaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VaultError"
  }
}

function keyFor(id: KeyId): Buffer | null {
  if (id === "ck") {
    const raw = process.env["NEXUS_CREDENTIALS_KEY"]?.trim()
    if (!raw) return null
    const key = Buffer.from(raw, "base64")
    if (key.length !== 32) throw new VaultError("NEXUS_CREDENTIALS_KEY must be 32 bytes, base64-encoded.")
    return key
  }
  const secret = process.env["AUTH_SECRET"]?.trim() || process.env["NEXTAUTH_SECRET"]?.trim()
  if (!secret) return null
  return Buffer.from(hkdfSync("sha256", secret, "nexus-command", "connector-credentials-v1", 32))
}

function activeKey(): { id: KeyId; key: Buffer } {
  const ck = keyFor("ck")
  if (ck) return { id: "ck", key: ck }
  const as = keyFor("as")
  if (as) return { id: "as", key: as }
  throw new VaultError("Set NEXUS_CREDENTIALS_KEY (or AUTH_SECRET) to store connector credentials.")
}

export function vaultReady(): boolean {
  try {
    activeKey()
    return true
  } catch {
    return false
  }
}

export function sealCredentials(credentials: Record<string, string>): string {
  const { id, key } = activeKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()])
  return ["v1", id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".")
}

export function openCredentials(sealed: string): Record<string, string> {
  const [version, id, iv, tag, body] = sealed.split(".")
  if (version !== "v1" || (id !== "ck" && id !== "as") || !iv || !tag || !body) throw new VaultError("Unreadable credentials.")
  const key = keyFor(id)
  if (!key) throw new VaultError("The key these credentials were sealed with is no longer configured.")
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    const text = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")
    return JSON.parse(text) as Record<string, string>
  } catch {
    throw new VaultError("Credentials could not be decrypted; reconnect this service.")
  }
}
