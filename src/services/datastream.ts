import { Datastream } from '@solana-tracker/data-api';

const WS_URL = process.env.NEXT_PUBLIC_DATASTREAM_URL || 'wss://datastream.solanatracker.io';

let instance: Datastream | null = null;

export function getDatastream(): Datastream | null {
  if (typeof window === 'undefined') return null;
  if (!instance) instance = new Datastream({ wsUrl: WS_URL });
  return instance;
}

export function disconnectDatastream(): void {
  instance?.disconnect();
  instance = null;
}
