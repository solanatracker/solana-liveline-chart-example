import { Client, Datastream } from '@solana-tracker/data-api';

const API_KEY = process.env.NEXT_PUBLIC_DATA_API_KEY || '';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://data.solanatracker.io';
const WS_URL = process.env.NEXT_PUBLIC_DATASTREAM_URL || 'wss://datastream.solanatracker.io';

let client: Client | null = null;
let datastream: Datastream | null = null;

export function getClient(): Client {
  if (!client) {
    client = new Client({ apiKey: API_KEY, baseUrl: API_BASE });
  }
  return client;
}

export function getDatastream(): Datastream | null {
  if (typeof window === 'undefined') return null;
  if (!datastream) {
    datastream = new Datastream({ wsUrl: WS_URL });
  }
  return datastream;
}

export function disconnectDatastream(): void {
  datastream?.disconnect();
  datastream = null;
}
