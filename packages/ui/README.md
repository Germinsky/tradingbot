## Trading Bot Dashboard

A real-time Next.js 15 dashboard for monitoring and controlling your trading bot.

### Features

- **Live PnL Chart**: Track realized and unrealized profits, fees in real-time
- **Position Heatmap**: Visual representation of positions across multiple chains (Ethereum, Base, Arbitrum, etc.)
- **Strategy Control**: Toggle strategies on/off, hot-reload configurations
- **Order Book Depth**: Aggregated order book data from multiple DEXs
- **WebSocket Integration**: Real-time updates with authentication
- **Dark Mode**: Full dark mode support with system preference detection
- **Mobile Responsive**: Works seamlessly on all device sizes

### Tech Stack

- **Next.js 15** with App Router
- **React 19** with Server Components
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Recharts** for data visualization
- **Socket.io-client** for WebSocket communication
- **Zustand** for state management

### Getting Started

1. Install dependencies:
   ```bash
   cd packages/ui
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your settings
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

### WebSocket Events

The dashboard listens for these events from the bot:

- `pnl_update`: Real-time PnL data
- `position_update`: Position changes across chains
- `strategy_update`: Strategy status and metrics
- `orderbook_update`: Order book depth from DEXs

The dashboard can emit these events:

- `toggle_strategy`: Enable/disable a strategy
- `reload_strategy`: Hot-reload strategy configuration
- `request_pnl_history`: Request historical PnL data

### Environment Variables

- `NEXT_PUBLIC_WS_URL`: WebSocket server URL (default: http://localhost:3001)
- `NEXT_PUBLIC_API_URL`: API endpoint URL
- `NEXT_PUBLIC_WS_AUTH_TOKEN`: Authentication token (optional)

### Building for Production

```bash
npm run build
npm run start
```

### Project Structure

```
src/
├── app/                    # Next.js app router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Dashboard page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── providers/         # Context providers
│   ├── ui/               # Reusable UI components
│   ├── PnLChart.tsx      # PnL visualization
│   ├── PositionHeatmap.tsx
│   ├── StrategyCards.tsx
│   └── OrderBookDepth.tsx
├── lib/                  # Utility functions
│   ├── socket.ts         # WebSocket client
│   └── utils.ts          # Helper functions
└── types/                # TypeScript definitions
    └── dashboard.ts
```
