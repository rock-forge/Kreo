<p align="center">
  <img src="dashboard/public/branding/kreo-banner-v2.webp" alt="Kreo — music for your Discord server" width="960" />
</p>

<h1 align="center">Kreo</h1>

<p align="center">
  A Discord music bot with a purple, responsive web dashboard.<br />
  Find a track, build a queue, and keep your server listening together.
</p>

<p align="center">
  <a href="https://github.com/rock-forge/Kreo/actions/workflows/ci.yml"><img src="https://github.com/rock-forge/Kreo/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" /></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/Node.js-24-5FA04E?style=flat-square" alt="Recommended runtime: Node.js 24" /></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/discord.js-14-5865F2?style=flat-square" alt="discord.js 14" /></a>
  <a href="./dashboard/package.json"><img src="https://img.shields.io/badge/Next.js-16-171717?style=flat-square" alt="Next.js 16" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Source%20available-A78BFA?style=flat-square" alt="Source available — read LICENSE" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="./SETUP_GUIDE.md">Full setup guide</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#how-it-fits-together">Architecture</a> ·
  <a href="./LICENSE">License</a> ·
  <a href="./docs/Kreo-Copyright-Notice.pdf">Copyright notice (PDF)</a>
</p>

> **Copyright notice:** [View or download the PDF](./docs/Kreo-Copyright-Notice.pdf)
> issued by **Dev Bhakat / rock-forge**, or [read the text version](./COPYRIGHT-NOTICE.md).

## Contents

- [What you get](#what-you-get)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [How it fits together](#how-it-fits-together)
- [Project structure](#project-structure)
- [Check your setup](#check-your-setup)
- [Troubleshooting](#troubleshooting)
- [Contributing and security](#contributing-and-security)
- [License and third-party notices](#license-and-third-party-notices)

## What you get

| Discord bot | Web dashboard |
| --- | --- |
| Prefix and slash music commands | Discord login and server selection |
| Search, queue, pause, skip, seek, volume, and 13 audio filters | Search and playback controls with live player updates |
| Liked tracks, personal playlists, and listening history | Personal liked songs and playlists |
| 24/7 mode, autoplay, sleep timer, lyrics, and connection recovery | Server settings, pinned servers, and recent rooms |
| Category help, owner controls, and application emoji support | Leaderboard, command palette, purple theme, and mobile navigation |

The bot uses discord.js, Kazagumo, and Shoukaku with a Lavalink v4 node. The dashboard uses Next.js, React, and Discord OAuth. MongoDB stores persistent settings and music collections.

**Music plays in Discord voice channels.** The dashboard controls the bot; it does not stream music through your browser. Join a voice channel in the selected server before adding music. When a player is already active, join the bot's voice channel to control it.

## Requirements

| You need | Notes |
| --- | --- |
| **Node.js 24** and npm | Matches the dashboard Docker image and CI. The root package accepts Node.js 20.19 or newer. |
| **Discord application** | Bot token, application (client) ID, and OAuth client secret. |
| **MongoDB** | Reachable from both the bot and the dashboard. |
| **Lavalink v4 node** | With plugins that support your chosen search source (`LAVALINK_SOURCE`). |

You provide and operate these services. For public hosting you also need a domain, HTTPS, and a process supervisor — see the [setup guide](./SETUP_GUIDE.md#6-host-on-a-linux-vps).

## Quick start

### 1. Get the source and install dependencies

```sh
git clone https://github.com/rock-forge/Kreo.git
cd Kreo
npm ci
npm ci --prefix dashboard
```

### 2. Create your local configuration

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
Copy-Item dashboard/.env.example dashboard/.env.local
```

**Linux / macOS**

```sh
cp .env.example .env
cp dashboard/.env.example dashboard/.env.local
```

Fill in both files (see [Configuration](#configuration) below). Set your Discord user ID in `OWNER_IDS`, use the same bridge secret in both files, and generate a different secret for NextAuth. Keep all real credentials out of commits.

In the Discord Developer Portal, enable **Server Members Intent** and **Message Content Intent**, then register this local OAuth redirect exactly:

```text
http://localhost:3000/api/auth/callback/discord
```

### 3. Build, then start

```sh
npm run build --prefix dashboard
npm start
```

`npm start` runs the bot and the dashboard together. Open [localhost:3000](http://localhost:3000), sign in with Discord, and select a server. Invite your bot, join a Discord voice channel, and search for a song. Run `/help` in Discord for the command menu. The prefix example is `>help` when using the supplied environment default; change it with `BOT_PREFIX`.

For development with dashboard hot reload:

```sh
npm run dev
```

### All npm scripts

| Script | What it does |
| --- | --- |
| `npm start` | Starts the bot and the built dashboard together |
| `npm run dev` | Starts the bot and the dashboard in hot-reload mode |
| `npm run start:bot` / `npm run dev:bot` | Bot only (cluster manager and dashboard bridge via `devrock.js`) |
| `npm run start:dash` / `npm run dev:dash` | Dashboard only |
| `npm test` | Runs the regression tests with mocked services |
| `npm run check:services` | Optional live check of Discord, MongoDB, and Lavalink |

Start the bot through `devrock.js` or `npm run start:bot`. Running `index.js` alone skips the cluster manager and bridge.

For VPS hosting, HTTPS, Docker, or Pterodactyl, follow the [full setup guide](./SETUP_GUIDE.md). Production dashboard startup requires a completed build.

## Configuration

Kreo reads two files. The full, annotated reference is in the [setup guide](./SETUP_GUIDE.md#3-configure-the-environment); these are the values you will touch first.

**Root `.env` (bot and bridge)**

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Bot token (`BOT_TOKEN` also works) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord application credentials |
| `OWNER_IDS` | Discord user IDs allowed to use owner commands |
| `BOT_PREFIX` | Prefix for text commands (default `>`) |
| `MONGO_URI` | MongoDB connection string (`MONGODB_URL` also works) |
| `LAVALINK_URL`, `LAVALINK_PASSWORD`, `LAVALINK_SECURE` | Your Lavalink v4 node |
| `LAVALINK_SOURCE` | Default search source (default `ytmsearch`) |
| `DASHBOARD_BRIDGE_SECRET` | Shared secret between bot and dashboard — must match in both files |
| `BRIDGE_PORT` | Port of the private bot bridge (default `2000`) |
| `DASHBOARD_ALLOWED_ORIGINS` | Dashboard origins allowed to reach the bridge |
| `DASHBOARD_TUNNEL_*` | Optional SSH tunnel when bot and dashboard run on different hosts |

**`dashboard/.env.local` (web dashboard)** — Discord OAuth credentials, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `MONGO_URI`, the bridge addresses (`DASHBOARD_API_URL`, `DASHBOARD_SOCKET_URL`), and the same `DASHBOARD_BRIDGE_SECRET`. Copy it from [`dashboard/.env.example`](./dashboard/.env.example).

## Commands

Use `/help` or your configured prefix followed by `help` to browse commands. Most commands work both as slash commands and with the prefix.

| Category | Commands |
| --- | --- |
| **Music** | `play`, `search`, `pause`, `resume`, `skip`, `skipto`, `forceskip`, `previous`, `replay`, `stop`, `seek`, `forward`, `rewind`, `speed`, `volume`, `loop`, `shuffle`, `autoplay`, `similar`, `queue`, `nowplaying`, `grab`, `history`, `lyrics`, `remove`, `move`, `clear`, `sleep`, `join`, `leave`, `leavecleanup`, `forcefix` |
| **Filters** | `filter` — 8D Audio, BassBoost, Deep Bass, Treble Boost, NightCore, Daycore, Slowed + Reverb, Vaporwave, Chipmunk, Karaoke, Soft, China, Vibrato, plus Reset |
| **Favourites** | `like`, `unlike`, `likeall`, `showliked`, `playliked` |
| **Playlists** | `pl-create`, `pl-add`, `pl-remove`, `pl-list`, `pl-play`, `pl-delete` |
| **Config** | `247`, `setprefix`, `ignore` |
| **Information** | `help`, `ping`, `stats`, `invite`, `support` |
| **Utility** | `autofix`, `avatar`, `banner`, `membercount`, `servericon`, `serverbanner` |

**Owner access.** Owners listed in `OWNER_IDS` can see and use the owner commands (server list, node status, blacklist, reload, restart, emoji tools, and more). Discord administrator permission alone does not make someone a bot owner.

At startup, Kreo attempts to load emojis belonging to its own Discord application. Existing fallback icons remain available when custom application emojis are unavailable.

## How it fits together

```text
Browser ── Discord OAuth ── Next.js dashboard
   │                              │
   │ signed Socket.IO ticket      │ private, authenticated HTTP
   ▼                              ▼
Socket.IO proxy ──────────── Bot bridge / cluster manager
                                   │
                         Discord bot ── Lavalink
                                   │
                                MongoDB
```

The dashboard checks the signed-in user's server access before forwarding supported actions. The private bridge requires `DASHBOARD_BRIDGE_SECRET`; playback also checks Discord membership, voice-channel access, and blacklist state. Browser updates use short-lived, server-scoped Socket.IO tickets issued by the dashboard's authenticated `/api/socket` route. The shared bridge secret stays on the servers.

In production, keep the bridge HTTP API on a private connection and expose only the ticket-protected `/socket.io/` route through HTTPS. [Deployment examples](./SETUP_GUIDE.md#6-host-on-a-linux-vps) cover this arrangement.

## Project structure

```text
Kreo/
├── devrock.js              Bot cluster manager and dashboard bridge (start here)
├── index.js                Discord bot worker entry point
├── src/
│   ├── commands/           Commands, one folder per category
│   ├── events/             Discord, Lavalink node, and player events
│   ├── loaders/            Command, event, node, and player loaders
│   ├── schema/             MongoDB models
│   ├── utils/              Playback, bridge, lyrics, and UI helpers
│   └── config.js           Reads your .env
├── scripts/                Optional service connection check
├── tests/                  Automated regression checks
└── dashboard/
    ├── src/app/            Next.js pages and authenticated API routes
    ├── src/components/     Shared UI (command palette, branding)
    ├── public/             Dashboard artwork and branding
    └── Dockerfile          Optional production dashboard image
```

## Check your setup

```sh
npm test
npm run lint --prefix dashboard
npm run build --prefix dashboard
```

These are the same checks that run in [CI](./.github/workflows/ci.yml) on every push to `main` and every pull request.

After supplying real service credentials, you can also run:

```sh
npm run check:services
```

This optional command connects to Discord, checks MongoDB access, and asks Lavalink for search results. It does not post Discord messages or modify stored data. Run it with awareness that it briefly opens a Discord gateway connection.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login returns an OAuth callback error | Application ID/secret, exact redirect URL, `NEXTAUTH_URL`, and a fresh sign-in after changing configuration |
| Dashboard opens but cannot control music | Bot process, private API address, matching bridge secrets, and your Discord voice channel |
| A track cannot be resolved | Lavalink node credentials and support for `LAVALINK_SOURCE` |
| Player updates do not arrive | HTTPS Socket.IO proxy, `DASHBOARD_SOCKET_URL`, and allowed origins |
| Owner commands are hidden | Your own Discord user ID in `OWNER_IDS`, followed by a bot restart |
| Production dashboard will not start | Install dashboard dependencies and run its build first |

See the [detailed troubleshooting section](./SETUP_GUIDE.md#9-troubleshooting) for checks and deployment-specific guidance.

## Contributing and security

Bug reports and ideas are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request, and open an issue first for larger changes. Remove tokens, secrets, and private server details from logs and screenshots.

Found a security problem? Do not post it publicly — follow [SECURITY.md](./SECURITY.md). Release history is in [CHANGELOG.md](./CHANGELOG.md).

## License and third-party notices

Kreo is credited to **[rock-forge](https://github.com/rock-forge)**. This is a **source-available** release for normal noncommercial use under [LICENSE](./LICENSE). **Commercial use, resale, and public redistribution of modified versions require rock-forge's written permission.** Read the license for the complete permitted use, attribution requirements, and restrictions.

Third-party components remain subject to their own terms. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) and the licenses distributed with the dependencies.

Read the [copyright notice](./COPYRIGHT-NOTICE.md) or download the
[notice PDF](./docs/Kreo-Copyright-Notice.pdf).
