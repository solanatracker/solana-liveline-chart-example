# Solana Liveline Chart

Real-time Solana price charts built with [Liveline](https://www.npmjs.com/package/liveline), the [Solana Tracker Data API SDK](https://github.com/solanatracker/data-api-sdk), and [Next.js](https://nextjs.org/).


<video width="1000" height="600" controls>
  <source src="https://videos.solanatracker.io/b2be6329-c58c-41a0-b4f4-2a31e9c2c4e8.mp4" type="video/mp4">
</video>

## Stack

| | |
|---|---|
| [Next.js 16](https://nextjs.org/) | App Router, Turbopack |
| [Liveline](https://www.npmjs.com/package/liveline) | 60fps canvas chart rendering |
| [@solana-tracker/data-api](https://github.com/solanatracker/data-api-sdk) | REST + WebSocket SDK |
| [TanStack Query](https://tanstack.com/query) | Data fetching and caching |
| [Tailwind CSS 4](https://tailwindcss.com/) | Styling |

## Setup

```bash
git clone <repo-url> && cd solana-liveline-chart-example
cp .env.example .env   # add your API key
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_DATA_API_KEY` | Yes | [Solana Tracker API key](https://www.solanatracker.io/account) |
| `NEXT_PUBLIC_DATASTREAM_URL` | No, used for live updates. | WebSocket URL (defaults to `wss://datastream.solanatracker.io/your-datastream-key`) |

## Structure

```
src/
├── app/
│   ├── layout.tsx              Root layout with providers
│   ├── page.tsx                Entry point
│   └── globals.css             Tailwind config
├── components/
│   ├── chart-page.tsx          Page layout, theme toggle, links
│   └── liveline-chart.tsx      Chart with live data streaming
├── providers/
│   ├── query-provider.tsx      TanStack Query client
│   └── token-provider.tsx      Token state and data fetching
└── services/
    └── api.ts                  SDK Client + Datastream singletons
```

## License

MIT
