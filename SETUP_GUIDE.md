# Kreo setup guide

Run the Discord bot and dashboard locally, then move them to a production host with HTTPS. All domains, paths, IDs, and credentials shown below are examples for your own deployment.

Kreo is credited to **[rock-forge](https://github.com/rock-forge)**. Normal noncommercial use is permitted under [LICENSE](./LICENSE). Commercial use, resale, and public redistribution of modified versions require rock-forge's written permission. Read the full license before using or distributing this source. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for third-party notices.

## 1. Requirements and layout

- **Node.js 24** and npm, matching the included dashboard Docker image. The root package declares a minimum of Node.js 20.19; this guide uses 24 consistently.
- A Discord application with its bot token, application/client ID, and OAuth client secret.
- MongoDB accessible from both the bot and dashboard, with a database user permitted to read and write the application's database.
- A **Lavalink v4** node accessible from the bot. Its installed sources/plugins must support the search source you choose.
- For public hosting: a domain, DNS access, a valid HTTPS certificate, and a process supervisor or container host.

```text
Kreo/
├── devrock.js              Bot cluster manager and dashboard bridge
├── index.js                Discord bot worker entry point
├── src/                    Commands, events, configuration, and models
├── scripts/                Optional service connection check
├── tests/                  Automated regression checks
├── .env                    Your private bot configuration
└── dashboard/
    ├── src/                Next.js pages and authenticated API routes
    ├── public/             Dashboard artwork and branding
    ├── Dockerfile          Optional production dashboard image
    └── .env.local          Your private dashboard configuration
```

Start the bot through `devrock.js` or `npm run start:bot`. Running `index.js` alone skips the cluster manager and bridge.

## 2. Prepare Discord

1. Create or select an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. In **Bot**, obtain the bot token. Enable **Server Members Intent** and **Message Content Intent**, which this bot requests. Follow Discord's approval requirements if they apply to your application.
3. In **OAuth2**, obtain the client ID and client secret. A bot token cannot replace an OAuth client secret.
4. Register the exact redirect for each environment you will use:

   | Environment | OAuth redirect |
   | --- | --- |
   | Local | `http://localhost:3000/api/auth/callback/discord` |
   | Production example | `https://music.example.com/api/auth/callback/discord` |

   The scheme, hostname, port, and path must match your `NEXTAUTH_URL` plus `/api/auth/callback/discord`. Use `localhost` consistently during local setup instead of mixing it with `127.0.0.1` in the browser.
5. Invite the bot with the `bot` and `applications.commands` scopes. Give it access to the text and voice channels you plan to use, including View Channel, Send Messages, Embed Links, Connect, and Speak. Additional commands may require additional permissions. The included `/api/invite` helper currently requests Administrator; review that permission request for your server before using it.
6. Copy your own Discord user ID into `OWNER_IDS`. For multiple owners, use comma-separated IDs without quotes around individual IDs. Bot ownership is independent of Discord server administrator permission.

The dashboard requests the Discord OAuth scopes `identify guilds`. Its provider already uses the issuer **`https://discord.com`**. Keep that issuer when configuring or reviewing the login flow; use the callback URL above as your application's redirect, not as the provider issuer.

## 3. Configure the environment

From the repository root, copy the two examples once. Avoid overwriting configuration you have already filled in.

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
Copy-Item dashboard/.env.example dashboard/.env.local
```

**Linux / macOS**

```sh
cp .env.example .env
cp dashboard/.env.example dashboard/.env.local
chmod 600 .env dashboard/.env.local
```

### Generate two independent secrets

Run this command **twice** and save each result privately:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

- Use the first result for `NEXTAUTH_SECRET`, which protects dashboard sessions.
- Use the second result for `DASHBOARD_BRIDGE_SECRET`, which authenticates the dashboard-to-bot connection and signs browser socket tickets.
- Set the **same bridge secret on the bot and dashboard**. Keep it different from `NEXTAUTH_SECRET`, the bot token, and the Discord client secret.

The code can derive a bridge secret from matching OAuth credentials when an explicit bridge secret is absent. Setting an explicit random bridge secret makes configuration and later rotation clearer.

### Root `.env`

Set these values using your own credentials:

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Bot token from the application's Bot page. `BOT_TOKEN` is a supported alias. |
| `DISCORD_CLIENT_ID` | Discord application/client ID used for OAuth and bot invites. |
| `DISCORD_CLIENT_SECRET` | OAuth client secret, independent of the bot token. |
| `OWNER_IDS` | Your Discord user ID, or a comma-separated list of owners. |
| `BOT_PREFIX` | Prefix for message commands; the supplied default is `>`. |
| `BOT_COLOR` | Hex color such as `"#A78BFA"`. Keep the quotes so `#` is not read as a comment. |
| `MONGO_URI` | MongoDB URI including your intended database name. `MONGODB_URL` is a supported alias. |
| `LAVALINK_NAME` | Display name for your node. |
| `LAVALINK_URL` | `host:port`, without an `http://`, `https://`, `ws://`, or `wss://` prefix. |
| `LAVALINK_PASSWORD` | Your node's actual password; replace the sample password. |
| `LAVALINK_SECURE` | `true` for a TLS-enabled node; otherwise `false`. |
| `LAVALINK_SOURCE` | A source supported by your node, such as `ytmsearch`. |
| `NEXTAUTH_URL` | Exact dashboard origin: initially `http://localhost:3000`. |
| `NEXT_PUBLIC_SITE_URL` | Dashboard site origin; keep it consistent with `NEXTAUTH_URL`. |
| `NEXTAUTH_SECRET` | Session secret generated above. Also set it in the dashboard file. |
| `DASHBOARD_BRIDGE_SECRET` | Shared bridge secret generated above. Also set it in the dashboard file. |
| `DASHBOARD_API_URL` | Private address where the dashboard server reaches the bridge. |
| `BRIDGE_PORT` | Bridge listener port; the supplied default is `2000`. |
| `DASHBOARD_ALLOWED_ORIGINS` | Dashboard origin, or comma-separated trusted origins. |

Optional settings include Spotify client credentials, support links, and `POWERED_BY_TEXT`. Spotify support still depends on compatible source configuration; music playback is resolved through Lavalink. Leave unused credentials blank.

For local development, keep these non-secret connection values:

```dotenv
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DASHBOARD_API_URL=http://localhost:2000
DASHBOARD_SOCKET_URL=http://localhost:2000
BRIDGE_PORT=2000
DASHBOARD_ALLOWED_ORIGINS=http://localhost:3000
DASHBOARD_TUNNEL_ENABLED=false
LAVALINK_SOURCE=ytmsearch
```

### Dashboard `dashboard/.env.local`

Fill in all keys in its example file. Use the same `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `MONGO_URI`, `NEXTAUTH_SECRET`, and `DASHBOARD_BRIDGE_SECRET` values as in root configuration.

For local development:

```dotenv
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DASHBOARD_API_URL=http://localhost:2000
DASHBOARD_SOCKET_URL=http://localhost:2000
```

The bot token belongs only in the bot configuration. The dashboard does not need it. Never put the bridge secret, client secret, database credentials, or session secret in a `NEXT_PUBLIC_*` variable.

`DASHBOARD_API_URL` and `DASHBOARD_SOCKET_URL` have different jobs:

| Setting | Who connects | Production example |
| --- | --- | --- |
| `DASHBOARD_API_URL` | Next.js server to the private bot HTTP API | `http://127.0.0.1:2000` |
| `DASHBOARD_SOCKET_URL` | Browser to the HTTPS Socket.IO proxy | `https://music.example.com` |

The socket URL is intentionally visible to browsers. Secrets are not. Restart affected processes after changing environment values. Rebuild the dashboard after changing the public site origin so generated pages and metadata use the new origin.

## 4. Set up MongoDB and Lavalink

### MongoDB

Create a database user and use the same application database in both configuration files. Restrict network access to the machines running the bot and dashboard. If using a hosted database, add those machines' outbound addresses to its network allowlist. Percent-encode special characters in URI credentials.

The bot waits for its database connection before logging in to Discord. A missing URI, invalid database password, unreachable server, or blocked network route can therefore prevent the bot from reaching its ready state.

### Lavalink

Configure a Lavalink v4 server separately; this repository does not bundle the server or its source plugins. Confirm its address, password, TLS mode, and search support before starting Kreo. The `ytmsearch` setting requires a source/plugin configuration that supports that identifier.

Use the root `LAVALINK_*` variables for one node. If your deployment needs several nodes, review the `nodes` array in `src/config.js` and the player manager configuration. A search result from a catalog is not enough on its own: the node must be able to resolve and play the selected audio source.

## 5. Install, run, and check locally

From the repository root:

```sh
npm ci
npm ci --prefix dashboard
npm run build --prefix dashboard
npm start
```

`npm start` runs the bot and production dashboard together. Open [http://localhost:3000](http://localhost:3000).

For development, use `npm run dev`. To run the components in separate terminals:

```sh
npm run start:bot
```

```sh
npm run start:dash
```

Do not start a second bot process while the first is running. Stop the existing process before switching modes.

### First playback check

1. Confirm the bot reaches its ready state and Lavalink connects.
2. Sign in to the dashboard and open a server where the bot is present.
3. **Join a Discord voice channel yourself.** If the bot is already playing, join that same channel.
4. Search for a track and add it to the queue. The audio plays in Discord, not in the browser.
5. Try pause/resume, skip, and volume. Check `/help` in Discord for bot command usage.

### Validation commands

```sh
npm test
npm run lint --prefix dashboard
npm run build --prefix dashboard
```

The optional connection check uses your real configured services:

```sh
npm run check:services
```

It briefly connects to the Discord gateway, checks MongoDB authentication/read access, and searches through Lavalink. It does not send Discord messages or change stored data. Run it separately from a production bot session when possible. Its result is a connectivity check, not an audible end-to-end playback test.

## 6. Host on a Linux VPS

The simplest arrangement is one VPS with the bot bridge reachable privately, Next.js listening on loopback, and Nginx exposing HTTPS. The example domain below is **`music.example.com`**; replace it throughout.

### Configure the production addresses

In root `.env`, set:

```dotenv
NEXTAUTH_URL=https://music.example.com
NEXT_PUBLIC_SITE_URL=https://music.example.com
DASHBOARD_ALLOWED_ORIGINS=https://music.example.com
BRIDGE_PORT=2000
```

In `dashboard/.env.local`, set:

```dotenv
NEXTAUTH_URL=https://music.example.com
NEXT_PUBLIC_SITE_URL=https://music.example.com
DASHBOARD_API_URL=http://127.0.0.1:2000
DASHBOARD_SOCKET_URL=https://music.example.com
```

Keep the independently generated secrets and OAuth/database settings filled in. Register `https://music.example.com/api/auth/callback/discord` in the same Discord application's OAuth redirects.

### Keep the bridge private

The bridge currently listens on its configured port on the process's available interfaces. Use host/container firewall rules or a private network so the HTTP API is reachable by the dashboard server, not directly from the public internet. Do not rely on CORS as a firewall.

The public reverse proxy should expose:

- `/` to Next.js on loopback port `3000`, including Next.js `/api/` routes.
- `/socket.io/` to the bot bridge on private port `2000`.

Do not proxy public `/api/` traffic straight to the bot bridge. Dashboard API routes perform session and server-access checks before making private, authenticated bridge requests.

Browser Socket.IO connections obtain a short-lived signed ticket from the dashboard's `/api/socket?guildId=...` route. That ticket is bound to the signed-in user and server. The bridge verifies it before joining the connection to the server's updates. Use the existing client flow; do not distribute the shared bridge secret to browsers.

### Run the processes reliably

Deploy the project to a directory such as `/srv/kreo`, owned by a dedicated service account. Install both dependency sets, then build:

```sh
npm ci
npm ci --prefix dashboard
npm run build --prefix dashboard
```

Use systemd or another process supervisor for the two long-running processes. For a manual first check, run the bot in one terminal:

```sh
npm run start:bot
```

Run Next.js in another, bound to loopback:

```sh
npm run start --prefix dashboard -- --hostname 127.0.0.1 --port 3000
```

For systemd, the bot's working directory must be `/srv/kreo` and its command must launch `/srv/kreo/devrock.js` with your installed Node executable. The dashboard's working directory must be `/srv/kreo/dashboard`; run its `npm run start -- --hostname 127.0.0.1 --port 3000`. Use the dedicated account, `NODE_ENV=production`, restart-on-failure, and the respective environment files. Determine executable paths with `command -v node` and `command -v npm` rather than assuming a shell's Node version manager is available to systemd.

### Configure DNS, Nginx, and HTTPS

Point the domain's DNS records at your VPS. Remove or correct any IPv6 record that points elsewhere. Allow inbound HTTP and HTTPS for the reverse proxy; keep application ports private.

Create an HTTP Nginx server block like this, substituting the private bridge address if the bot runs in a container or on another host:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name music.example.com;

    client_max_body_size 2m;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:2000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }
}
```

Enable that site using your distribution's Nginx layout. After installing Nginx, Certbot, and Certbot's Nginx plugin for your distribution:

```sh
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d music.example.com --redirect
sudo nginx -t
sudo certbot renew --dry-run
```

Certbot must be able to validate your domain. Finish with a valid HTTPS certificate, HTTP-to-HTTPS redirection, and renewal enabled. If using an external TLS proxy, preserve the original host and HTTPS scheme in forwarded headers. Add HSTS only after confirming HTTPS works for the intended domain.

### Optional: run the dashboard in Docker

The included Dockerfile builds a standalone dashboard image. From the repository root on a Linux VPS:

```sh
docker build --build-arg SITE_URL=https://music.example.com -t kreo-dashboard:local dashboard
docker run -d --name kreo-dashboard --restart unless-stopped --network host --env-file /srv/kreo/dashboard/.env.local kreo-dashboard:local
```

The example uses Linux host networking because the image binds to `127.0.0.1:3000` and its private API address also uses host loopback. Keep Nginx on that host and keep the runtime environment file readable only by the deployment account. Do not include credentials as image build arguments. Do not run this container alongside a native dashboard already using port `3000`.

## 7. Run the bot on Pterodactyl

You can run the bot in a Node.js server on Pterodactyl while hosting the dashboard on a VPS. The dashboard remains a separate web service; uploading only the bot does not host the website.

1. Use a Node.js 24-compatible image/egg and upload the root bot files, `src/`, `scripts/`, and root package/lockfiles. You may omit `dashboard/` and `tests/` from a bot-only runtime upload.
2. Create the bot's private `.env` or provide its environment variables through the panel. Do not upload example credentials as real configuration.
3. Install locked runtime dependencies with `npm ci --omit=dev` through the installation process or an available shell. Complete installation before launching the bot.
4. Set the startup command to `npm run start:bot` or `node devrock.js`. Disable any optional auto-update step that would overwrite your configuration or reinstall unrelated files.
5. Confirm the container can reach Discord, MongoDB, and Lavalink, then start it and review its logs.
6. Arrange a **private** route from the dashboard host to the bridge. `localhost` inside a container refers to that container, not the VPS or another container.

If using a node allocation or container network, use an address reachable from the dashboard host and restrict the allocation to that host/private network. Docker-published ports may require container-network firewall rules in addition to ordinary host firewall rules. Keep bridge port `2000` off the public internet.

### Optional private SSH tunnel

The bot includes an outbound SSH tunnel for situations where the dashboard host cannot directly reach the bot container. The bot connects outward to the dashboard VPS and requests a port bound to **`127.0.0.1` on that VPS**.

Prepare a dedicated SSH account and key for this purpose. Install its public key on the dashboard VPS, allow the required remote loopback forward, and restrict the account/key to that forwarding use. Store the private key only where the bot can read it. Obtain the VPS host-key fingerprint through a trusted channel, such as its provider console; on that VPS, an administrator can inspect the selected host key with:

```sh
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

Set the following root bot variables using your own hostname, account, key path, and verified fingerprint:

```dotenv
DASHBOARD_TUNNEL_ENABLED=true
DASHBOARD_TUNNEL_HOST=vps.example.com
DASHBOARD_TUNNEL_USER=kreo-tunnel
DASHBOARD_TUNNEL_KEY_PATH=/home/container/.ssh/dashboard_ed25519
DASHBOARD_TUNNEL_HOST_SHA256=SHA256:REPLACE_WITH_VERIFIED_HOST_FINGERPRINT
DASHBOARD_TUNNEL_REMOTE_PORT=2000
DASHBOARD_TUNNEL_SSH_PORT=22
BRIDGE_PORT=2000
```

On the VPS, keep `DASHBOARD_API_URL=http://127.0.0.1:2000` and proxy `/socket.io/` to that same loopback address. Keep `DASHBOARD_SOCKET_URL=https://music.example.com` for browsers. Choose a different unused remote port and update both consumers if port `2000` is occupied. The VPS SSH server must permit the dedicated account's remote loopback forward; do not enable public remote forwarding for this setup.

After restarting the bot, look for the private-tunnel connection message, then check the VPS loopback health endpoint. A Pterodactyl allocation for inbound bridge traffic is not needed when this outbound tunnel is the only connection path.

## 8. Verify production and update safely

On the dashboard VPS, verify the private bridge:

```sh
curl --fail http://127.0.0.1:2000/api/health
```

The expected response is `{"status":"ok"}`. This health route checks the bridge process; separately confirm Discord, MongoDB, and Lavalink readiness in bot logs. The other bridge API routes require the shared secret.

Then verify HTTPS, fresh Discord login, server selection, a real voice-channel playback attempt, and player updates. Check that you can refresh a dashboard page directly without losing routing.

For updates, stop the affected process, preserve its private environment and database, update the source, run `npm ci` for each changed package, run the checks, rebuild the dashboard, and restart. Keep a previous working release so you can restore it if startup checks fail. Back up MongoDB according to your hosting arrangement before changes that affect stored data.

## 9. Troubleshooting

| Symptom | What to check |
| --- | --- |
| OAuth callback error or repeated login | Client ID and secret belong to the same Discord application; registered redirect matches `NEXTAUTH_URL` exactly; public proxy preserves HTTPS/host; `NEXTAUTH_SECRET` is set and stable. Restart after changes and begin a fresh login. |
| Invalid or missing configuration | Fill the actual `.env` and dashboard `.env.local`, not just their examples. Start commands from the documented directories and use `DISCORD_TOKEN`/`BOT_TOKEN` and `MONGO_URI`/`MONGODB_URL` consistently. |
| Bot token rejected or gateway closes for intents | Use the current Bot token, not the OAuth secret. Enable the requested privileged intents in the portal and confirm any required Discord approval. |
| Bot never becomes ready | Check MongoDB credentials, database name, network allowlist, DNS, and outbound network access; database connection happens before Discord login. |
| Dashboard reports bridge communication failure | Confirm bot process/port and `DASHBOARD_API_URL` from the dashboard machine or container. Check matching `DASHBOARD_BRIDGE_SECRET` values, tunnel/private networking, and firewall rules. |
| `localhost` works on the host but not in a container | Loopback addresses are isolated by container. Use the intended private network, the documented Linux host-network dashboard option, or the outbound tunnel. |
| Search works but adding a song fails | Join a Discord voice channel in that server. For an active player, join the same channel as the bot. Check bot Connect/Speak access, blacklist state, and Lavalink track-resolution errors. |
| Search returns no playable results | Ensure `LAVALINK_SOURCE` is supported by the node's installed sources/plugins; confirm its password, TLS setting, and outbound media access. |
| HTTPS page has no live updates | Use an HTTPS `DASHBOARD_SOCKET_URL`, proxy `/socket.io/` with upgrade headers, and allow the exact dashboard origin. HTTP socket URLs are skipped on HTTPS pages. Failed socket-ticket requests can indicate an expired login or lost server membership. |
| Periodic socket reconnect | Tickets expire after five minutes and the client reconnects for a fresh ticket. Repeated rapid failures need investigation of login, origin, proxy, and bridge-secret settings. |
| Owner menu is missing | Put your Discord user ID in root `OWNER_IDS`, restart the bot, and open a new help menu. Server administrator permission is separate. |
| Production says a build is missing | Run `npm ci --prefix dashboard` and `npm run build --prefix dashboard` before its production start command. |
| Browser reports a certificate/domain problem | Verify DNS for both IPv4 and IPv6, certificate hostname/expiry/chain, HTTPS proxy configuration, and renewal. Start login from the canonical HTTPS domain after correcting them. |

Keep `.env`, `.env.local`, SSH keys, database backups, and process logs containing private data out of public commits and support messages. When rotating a bridge secret, update both sides and restart them; when rotating `NEXTAUTH_SECRET`, expect existing dashboard sessions to require a new login.
