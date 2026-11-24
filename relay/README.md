# Relay Studio

Upload a video once and publish it to **YouTube, Instagram and Facebook** in one click. Then follow how it does: followers, daily views, top videos and top comments from every channel in one place.

## What it does

| Screen | What you get |
|---|---|
| **Dashboard** | Total audience, views, what is scheduled next, recent posts, and anything that needs attention (failed uploads, lost connections). |
| **Assistant** | Tell it in plain words what to post, where and when, or ask about comments and numbers. It looks things up itself and shows you each post or reply for approval before anything goes out. Needs an Anthropic API key. |
| **Publish** | Pick a video, tick the channels it should go to, write a title, description and hashtags once. Each platform gets the fields it accepts, with live counters and warnings. Publish now, schedule, or save as a draft. |
| **Calendar** | Month view of scheduled and published posts. Pick a day to schedule a post for it. |
| **Posts** | Upload progress per channel, links to the published videos, retry for anything that failed, drafts, search, and "Post again" to reuse an earlier post. |
| **Library** | Every video you uploaded, ready to publish again without re-uploading. |
| **Analytics** | Audience and its growth over time, daily views/reach per channel, a sortable video table with engagement rate, per-channel filter and CSV export. |
| **Performance** | Your newest video against the three before it, hour by hour since each was published, for views, likes, comments and shares, within any window from 1 to 72 hours. Includes an estimate of whether it is breaking out, judged against your own earlier videos at the same age. |
| **Comments** | Comments on your recent videos across all channels, with search, sorting and replies. |
| **Channels** | Connect and disconnect accounts. A demo mode adds sample channels so you can look around before setting up API keys. |

Time-savers on the Publish page:

- **Channel groups**: tick a set of channels (for example every account of one brand), save it as a group, and select it with one click next time. Nothing is ticked by default except what you used last time.
- **Saved hashtag sets and caption templates**: the "Saved" link under the description and hashtag fields.

### What each platform takes

| | YouTube | Instagram | Facebook |
|---|---|---|---|
| Title | Required, 100 characters | None (the app puts your title on the first caption line) | Video: optional, 255. Reel: none |
| Text | Description, 5,000 bytes | Caption, 2,200 characters | Description |
| Hashtags | In the description, and as tags (500 characters total) | In the caption, 30 at most | In the description |
| Format | Vertical or square up to 3 minutes becomes a Short | Every video is a Reel, 3 seconds to 15 minutes | Video, or Reel for short vertical clips |
| Extras | Visibility, category, made-for-kids, notify subscribers | Share to main feed | Video / Reel switch |
| Account needed | Any channel | Business or Creator account linked to a Facebook Page | A Page (not a personal profile) |

These rules live in one file, `src/shared/platforms.ts`, used by both the screen and the server.

## Run it

Needs Node.js 22 or newer. `ffmpeg` is optional (thumbnails and exact video metadata).

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

Open http://localhost:5173, go to **Channels** and click **Try with demo channels** to explore with sample data.

For a permanent install, either run the production build:

```bash
npm run build
```

```bash
npm start
```

or use Docker (includes ffmpeg; data is kept in a volume):

```bash
docker compose up -d --build
```

Both serve the app on http://localhost:8787. Set `PUBLIC_URL` in `.env` to the address you actually open, and set `APP_PASSWORD` before exposing it beyond your own machine.

## Keep it running on your Mac (no Terminal window)

Instead of `npm run dev`, the app can run as a background service that starts by itself when you log in.

In Finder, open the `relay/mac` folder and double-click:

| File | What it does |
|---|---|
| **Start Relay Studio** | Builds if needed, starts the app, and makes it start at every login |
| **Stop Relay Studio** | Stops it. It stays off until you start it again |
| **Update Relay Studio** | Downloads the latest version, rebuilds, and restarts if it was running |
| **Show Logs** | Opens the logs folder and shows the latest lines |

The same from a terminal: `./relay.sh start`, `stop`, `restart`, `update`, `status`, `logs`, `open`.

- The address stays whatever `PUBLIC_URL` in `.env` says (http://localhost:5173 by default), so the Google and Meta sign-in settings keep working.
- Only this computer can reach the app, so no password is needed.
- **Logs** are in `relay/logs`: `app.log` records uploads, failures and scheduled posts with timestamps; `update.log` holds the output of the last update or build. `app.log` is moved to `app.log.1` once it passes about 5 MB.
- Scheduled posts go out only while the Mac is on and awake.
- Stop `npm run dev` first if it is open; both use the same address.

## Putting it on a domain

To use the app from your phone or another computer, run it on a server that stays on. It needs a machine with a disk (videos and the database are stored on it), so use a small virtual server (VPS) rather than a serverless host.

1. Rent a VPS with Docker (2 GB of memory is enough; pick disk size for your videos) and point your domain or a subdomain at its IP address with a DNS **A record**.
2. Copy this folder to the server (`git clone`), then create `.env` from `.env.example` and set:
   - `APP_PASSWORD` to a long, unique password. The app refuses to start on a public address without it.
   - `DOMAIN=studio.example.com` and `PUBLIC_URL=https://studio.example.com`
   - your Google, Meta and Anthropic keys.
3. On an Ubuntu server, `./server.sh setup` installs Docker and prepares `.env`, and `./server.sh start` builds and starts everything (`update`, `logs`, `status` and `backup` are there too). Or start it by hand:
   ```bash
   docker compose --profile web up -d --build
   ```
   Caddy obtains and renews the HTTPS certificate by itself.
4. In the Google and Meta consoles, add the new redirect addresses: `https://studio.example.com/api/oauth/google/callback` and `https://studio.example.com/api/oauth/meta/callback`.
5. Open the site, sign in with your password, and connect your channels again on the Channels page. Connections made on your own computer do not carry over.

Back up the `relay_data` Docker volume: it holds your library, history and connections.

## Connecting your real accounts

The platforms only let apps publish through their official APIs, and each needs you to register a (free) developer app once. This is a one-time setup of about 20 minutes.

### YouTube

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project.
2. **APIs & Services → Library**: enable *YouTube Data API v3* and *YouTube Analytics API*.
3. **OAuth consent screen**: user type *External*; add your own Google account under *Test users*.
4. **Credentials → Create credentials → OAuth client ID**, type *Web application*. Add the redirect URI `<PUBLIC_URL>/api/oauth/google/callback`.
5. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, restart, then click **Connect YouTube**.

Things to know:

- **Until Google has audited your API project, videos uploaded through the API are locked to private.** You can request the audit from the YouTube API Services compliance form; after it passes, uploads publish with the visibility you chose.
- Uploads are limited by a daily API quota. If you hit it, the post shows YouTube's quota message and can be retried the next day.
- While the consent screen is in *Testing*, Google expires the sign-in every 7 days and the channel will show "Reconnect needed". Publishing the consent screen removes that.

### Instagram and Facebook

1. Your Instagram account must be a **Business or Creator** account and be **linked to a Facebook Page**.
2. At [developers.facebook.com](https://developers.facebook.com/apps/) create an app (type *Business*) and add the *Facebook Login for Business* product.
3. In the login settings add the redirect URI `<PUBLIC_URL>/api/oauth/meta/callback`.
4. Put the App ID and App secret in `.env` as `META_APP_ID` and `META_APP_SECRET`, restart, then click **Connect Instagram and Facebook** and tick the Pages you want.

Things to know:

- While the Meta app is in development mode it works for accounts that have a role on the app (you). That is enough for personal use. To let other people connect, Meta requires App Review for the permissions the app requests.
- Meta redirects only to HTTPS addresses, except `localhost`.
- Instagram needs MP4 or MOV (H.264 video, AAC audio).

## The assistant

Add `ANTHROPIC_API_KEY` to `.env` (create a key in the Claude Console) and restart. Then open **Assistant** and type things like "post my newest video to all Instagram accounts tomorrow at 6pm" or "show me comments worth replying to and draft replies".

- **Write with AI** on the Publish page: type a few words about the video and it fills in the title, description and hashtags, plus a separate version for YouTube, Instagram and Facebook, in the style of your recent titles. With `ffmpeg` installed it also looks at still frames from the video. Everything stays editable, and there is an Undo.
- It can read your channels, library, posts, statistics and comments on its own.
- **Weekly review**: ask "what's working?" or click **Weekly review** on the Dashboard or Analytics page. It compares the last 7 days with the 7 before, per channel, and says what is working, what needs attention and what to do next. The comparisons are calculated by the app, and the assistant writes the summary from them.
- Publishing and replying are only ever **proposed**. You see exactly what will go out and click Approve or Decline. This is deliberate: comments are written by strangers, and the approval step means text in a comment can never make the app post something by itself.
- Videos must be in the Library first; the assistant picks from there.
- Conversations are kept in memory and reset when the server restarts.
- It uses Claude Haiku 5.5 by default, the cheapest current model. Set `AGENT_MODEL` in `.env` (for example `claude-sonnet-5-5`) if you want stronger writing at a higher price.
- Requests go to Anthropic's API and are billed to your account. Treat the key like a password: keep it in `.env` only.

## Good to know

- **Scheduling** is done by this app, not the platforms, so the app must be running at the scheduled time. If the server was off, the post goes out when it starts again.
- **Tokens** are encrypted (AES-256-GCM) before being saved. The key is `APP_SECRET`, or a generated `data/secret.key`. Back up the `data` folder to keep your connections, library and history.
- **Demo channels** never contact any platform. Their numbers are made up.
- **Audience growth** is recorded by this app once the channel is connected (the platforms do not provide follower history), so that chart starts empty and fills in day by day while the app runs.
- **Hour-by-hour figures** on the Performance page come from the app's own readings, taken every half hour while it is running, because the platforms report only running totals. A video's first hours are recorded only if the app was running and the channel was connected when it was published; earlier videos show "not recorded". The breakout estimate needs at least two earlier videos recorded at the same age.
- Statistics are cached for five minutes to stay inside API quotas; the refresh button fetches fresh numbers.
- Instagram reports daily *reach* rather than daily views, so the trend chart labels that line accordingly.

## Stack

TypeScript throughout. React 19, Vite, Tailwind CSS 4, TanStack Query and Recharts in the browser; Fastify 5, Drizzle ORM and SQLite on the server. One process, one port, no separate database to run.

```
src/shared/     platform rules and API types, used by both sides
src/server/     Fastify API, publish queue and scheduler, platform integrations
src/web/        React UI
drizzle/        database migrations (applied automatically on start)
tests/          platform rules and integration call-sequence tests
```

```bash
npm test
```

```bash
npm run typecheck
```
