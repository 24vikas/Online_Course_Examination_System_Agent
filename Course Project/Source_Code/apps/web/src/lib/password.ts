import * as crypto from "node:crypto";

// The deployed Node 24 runtime provides Argon2id. The workspace's Node 20
// declarations predate the runtime API.
type Argon2 = (
  algorithm: "argon2id",
  params: { message: Buffer; nonce: Buffer; parallelism: number; tagLength: number; memory: number; passes: number },
  callback: (error: Error | null, result: Buffer) => void,
) => void;

function derive(password: string, nonce: Buffer): Promise<Buffer> {
  const argon2 = (crypto as unknown as { argon2: Argon2 }).argon2;
  return new Promise((resolve, reject) => {
    argon2("argon2id", {
      message: Buffer.from(password), nonce, parallelism: 1, tagLength: 32, memory: 19456, passes: 2,
    }, (error, result) => error ? reject(error) : resolve(result));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const digest = await derive(password, salt);
  return `argon2id-v1:${salt.toString("hex")}:${digest.toString("hex")}`;
}

export async function verifyPassword(password: string, stored?: string): Promise<boolean> {
  const match = stored?.match(/^argon2id-v1:([a-f0-9]{32}):([a-f0-9]{64})$/);
  const actual = await derive(password, match ? Buffer.from(match[1], "hex") : Buffer.alloc(16));
  return !!match && crypto.timingSafeEqual(actual, Buffer.from(match[2], "hex"));
}
