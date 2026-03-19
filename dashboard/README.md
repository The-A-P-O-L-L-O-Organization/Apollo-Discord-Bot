# A.P.O.L.L.O Dashboard

Web dashboard for the A.P.O.L.L.O Discord bot, built with Next.js and shadcn/ui.

## Features

- **Server Management**: View and manage all connected Discord servers
- **Moderation Dashboard**: Monitor moderation actions, warnings, and strikes
- **Ticket System**: View and manage support tickets
- **Analytics**: Server statistics and bot usage metrics
- **Settings**: Configure bot settings globally

## Tech Stack

- **Framework**: Next.js 16
- **UI Library**: shadcn/ui (Radix UI + Tailwind CSS)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Run the development server:
   ```bash
   pnpm dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Connecting to the Bot

To connect the dashboard to your Discord bot:

1. Enter your bot token in the token field
2. The dashboard will fetch all servers where the bot is installed
3. Select a server to manage settings and view statistics

## Project Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── badge.tsx
│   │   └── layout/
│   └── lib/
│       └── utils.ts
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## Features (Planned)

- [ ] Real-time updates via WebSocket
- [ ] Ticket management interface
- [ ] Moderation command panel
- [ ] Server configuration editor
- [ ] Analytics charts and graphs
- [ ] User management
- [ ] Role editor
- [ ] Channel permissions viewer
- [ ] Command usage statistics
- [ ] Automated reports

## License

ISC
