import type { AuctionListing, SearchConfig } from '../types/index.js';

export abstract class BaseCrawler {
  abstract readonly siteName: string;

  abstract search(config: SearchConfig): Promise<AuctionListing[]>;

  protected now(): string {
    return new Date().toISOString();
  }

  protected isExpired(endTimeIso: string): boolean {
    return !!endTimeIso && new Date(endTimeIso).getTime() < Date.now();
  }

  protected log(msg: string): void {
    console.log(`[${this.siteName}] ${msg}`);
  }

  protected logError(msg: string, err?: unknown): void {
    console.error(`[${this.siteName}] ${msg}`, err instanceof Error ? err.message : err);
  }
}
