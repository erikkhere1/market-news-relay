# news-relay-bot

Monitors a Discord channel and relays any message containing the keywords **iran**, **strait**, **oil**, or **crude** to a target channel.

## How it works

1. Listens to source channel `1143670993177550950`
2. Checks every message (from any user) for the keywords: `iran`, `strait`, `oil`, `crude` (case-insensitive)
3. If matched, relays the message to channel `807741753976291348` using a webhook (preserving sender name and avatar)

---

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create an `env` file (see `env.example`):
   ```
   DISCORD_TOKEN=your_bot_token_here
   SOURCE_CHANNEL_ID=1143670993177550950
   TARGET_CHANNEL_ID=807741753976291348
   ```

3. Run:
   ```bash
   npm start
   ```

---

## Deploy to Railway

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → select this repo.
3. In **Variables**, add:

   | Key | Value |
   |-----|-------|
   | `DISCORD_TOKEN` | Your bot token |
   | `SOURCE_CHANNEL_ID` | `1143670993177550950` |
   | `TARGET_CHANNEL_ID` | `807741753976291348` |

4. Railway auto-deploys on every push to `main`.

---

## Bot permissions required

- **Privileged Gateway Intents**: Message Content Intent ✅
- **Channel permissions in target channel**: Read Messages, Send Messages, Manage Webhooks
