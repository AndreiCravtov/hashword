/** Hashword 0.6.3 compatibility. Do not substitute NIST SHA-3 or truncate a larger digest. */
export interface Settings {
  pwLength: number;
  symbols: boolean;
  generation: number;
  notes?: string;
  createDate?: number;
  accessDate?: number;
}

export const defaults: Settings = { pwLength: 16, symbols: true, generation: 1 };
const mask = (1n << 64n) - 1n;
const rotations = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const rounds = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const rotate = (v: bigint, n: number) => ((v << BigInt(n)) | (v >> BigInt(64 - n))) & mask;

function permute(a: bigint[]): void {
  for (const round of rounds) {
    const c = Array.from({ length: 5 }, (_, x) => a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20]);
    const d = c.map((_, x) => c[(x + 4) % 5] ^ rotate(c[(x + 1) % 5], 1));
    const b = Array<bigint>(25).fill(0n);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const i = x + 5 * y;
      b[y + 5 * ((2 * x + 3 * y) % 5)] = rotate(a[i] ^ d[x], rotations[i]);
    }
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      a[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y]);
    }
    a[0] ^= round;
  }
}

function digest(key: string, bits: number): Uint8Array {
  // CryptoJS's UTF-8 encoder rejects lone surrogates; TextEncoder would silently replace them.
  encodeURIComponent(key);
  const input = new TextEncoder().encode(key);
  const rate = (1600 - 2 * bits) / 8;
  const padded = new Uint8Array(Math.ceil((input.length + 1) / rate) * rate);
  padded.set(input);
  padded[input.length] = 0x01; // Keccak padding (NIST SHA-3 would use 0x06).
  padded[padded.length - 1] |= 0x80;
  const state = Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate; i++) state[i >> 3] ^= BigInt(padded[offset + i]) << BigInt(8 * (i % 8));
    permute(state);
  }
  return Uint8Array.from({ length: bits / 8 }, (_, i) => Number((state[i >> 3] >> BigInt(8 * (i % 8))) & 255n));
}

const classes = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef', 'ghijklmnopqrstuvwxyzABCDEFGHIJKL',
  'MNOPQRSTUVWXYZabcdefghijklmnopqr', 'stuvwxyzABCDEFGHIJKLMNOPQRSTUVWX',
];
const symbols = '!#+,-./@';

export function getHashword(domain: string, master: string, settings: Settings): string {
  validateSettings(settings);
  const bytes = digest(master + '@' + domain.toLowerCase() + '+' + settings.generation, settings.pwLength * 4);
  const view = new DataView(bytes.buffer);
  let output = '';
  let characterClass = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const word = view.getUint32(i);
    const numberStart = (word >>> 31) * 15 + 6;
    for (let bit = 1; bit < 32;) {
      if (bit === numberStart) {
        const chunk = (word >>> (32 - bit - 6)) & 63;
        output += settings.symbols ? String(chunk >>> 3).padStart(2, '0') + symbols[chunk & 7] : String(chunk).padStart(3, '0');
        bit += 6;
      } else {
        output += classes[characterClass][(word >>> (32 - bit - 5)) & 31];
        characterClass = (characterClass + 1) % 4;
        bit += 5;
      }
    }
  }
  return output;
}

export function validateSettings(value: unknown): asserts value is Settings {
  if (!value || typeof value !== 'object') throw new Error('Missing site settings.');
  const s = value as Settings;
  // Both lengths offered by the original UI. Refuse unsupported values rather than change a password.
  if ((s.pwLength !== 8 && s.pwLength !== 16) || typeof s.symbols !== 'boolean' ||
      typeof s.generation !== 'number' || !Number.isFinite(s.generation)) {
    throw new Error('Invalid settings: use length 8 or 16, a symbols flag, and a finite generation number.');
  }
}
