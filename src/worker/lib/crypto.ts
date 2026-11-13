const encoder = new TextEncoder();

let instanceRandom: Uint8Array | null = null;
let monotonicCounter = 0;

export function generateId(): string {
  if (!instanceRandom) {
    const init = new Uint8Array(5);
    crypto.getRandomValues(init);
    instanceRandom = init.subarray(0, 2);
    monotonicCounter = (init[2] << 16) | (init[3] << 8) | init[4];
  }

  const bytes = new Uint8Array(12);
  const nowSec = Math.floor(Date.now() / 1000);
  bytes[0] = (nowSec >>> 24) & 0xff;
  bytes[1] = (nowSec >>> 16) & 0xff;
  bytes[2] = (nowSec >>> 8) & 0xff;
  bytes[3] = nowSec & 0xff;

  // Keep same-second calls from the same Worker isolate strictly sortable
  bytes[4] = instanceRandom[0];
  bytes[5] = instanceRandom[1];
  monotonicCounter = (monotonicCounter + 1) & 0xffffff;
  bytes[6] = (monotonicCounter >>> 16) & 0xff;
  bytes[7] = (monotonicCounter >>> 8) & 0xff;
  bytes[8] = monotonicCounter & 0xff;

  const tail = new Uint8Array(3);
  crypto.getRandomValues(tail);
  bytes[9] = tail[0];
  bytes[10] = tail[1];
  bytes[11] = tail[2];

  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Raw(
  keyBytes: Uint8Array | ArrayBuffer,
  message: string
): Promise<Uint8Array> {
  const rawKey: ArrayBuffer =
    keyBytes instanceof ArrayBuffer
      ? keyBytes
      : keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return new Uint8Array(sig);
}

export async function hmacSha256Hex(
  keyBytes: Uint8Array | ArrayBuffer,
  message: string
): Promise<string> {
  return bytesToHex(await hmacSha256Raw(keyBytes, message));
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const len = Math.max(aBytes.length, bBytes.length, 1);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}
