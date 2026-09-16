/** Tracks only active intervals; delayed timers cannot credit unlimited time. */
export class ActivePlayClock {
  private since: number | null = null;
  private remainder = 0;
  resume(now: number) { if (this.since === null) this.since = now; }
  take(now: number) {
    if (this.since === null) return 0;
    const milliseconds = Math.min(30000, Math.max(0, now - this.since) + this.remainder);
    this.since = Math.max(this.since, now);
    const seconds = Math.floor(milliseconds / 1000);
    this.remainder = milliseconds - seconds * 1000;
    return seconds;
  }
  pause(now: number) {
    const seconds = this.take(now);
    this.since = null;
    this.remainder = 0;
    return seconds;
  }
}

export function readGameScore(event: Pick<MessageEvent, "source" | "data">, frame: Window | null): number | null {
  if (!frame || event.source !== frame || typeof event.data !== "object" || event.data === null) return null;
  const { type, score } = event.data;
  return type === "tfg:score" && Number.isInteger(score) && score >= 0 && score <= 2147483647 ? score : null;
}

/** getRandomValues also works on the existing HTTP preview deployment. */
export function createPlayRequestId(source: { getRandomValues(bytes: Uint8Array): Uint8Array } = crypto): string {
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
