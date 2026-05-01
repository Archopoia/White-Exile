/**
 * Token-bucket rate limiter, one bucket per socket message kind.
 *
 * Refills at `ratePerSec` tokens per second, with a `burst` cap. Each call to
 * `take()` consumes one token; returns false when empty so the caller can
 * reject + log without exceptions on the hot path.
 */
export interface TokenBucketOptions {
  ratePerSec: number;
  burst: number;
}

export class TokenBucket {
  private tokens: number;
  private last: number;
  private readonly rate: number;
  private readonly burst: number;

  constructor(options: TokenBucketOptions) {
    this.rate = options.ratePerSec;
    this.burst = options.burst;
    this.tokens = options.burst;
    this.last = Date.now();
  }

  take(now: number = Date.now(), cost: number = 1): boolean {
    const elapsed = (now - this.last) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate);
      this.last = now;
    }
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
