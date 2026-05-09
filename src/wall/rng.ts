/**
 * 決定論的擬似乱数生成器（Mulberry32）。
 * 同じ seed から同じ系列を生成する。
 * 麻雀の山生成は再現性が命なので、Math.random は使わない。
 */
export class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    // 32bit に丸める
    this.state = seed | 0;
  }

  /** [0, 1) の浮動小数点 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, n) の整数 */
  nextInt(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** 配列を Fisher-Yates でシャッフル（in-place） */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
}
