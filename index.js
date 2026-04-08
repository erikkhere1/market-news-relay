console.log('Bot starting...');
require('dotenv').config({ path: './env' });
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const SOURCE_CHANNEL_ID = process.env.SOURCE_CHANNEL_ID;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;

const KEYWORDS = ['iran', 'strait', 'oil', 'crude'];

// Helper to get or create a webhook in the target channel
async function getOrCreateWebhook(channel) {
  const webhooks = await channel.fetchWebhooks();
  let webhook = webhooks.find(wh => wh.owner && wh.owner.id === client.user.id);
  if (!webhook) {
    webhook = await channel.createWebhook({
      name: 'Relay Webhook',
      avatar: client.user.displayAvatarURL()
    });
  }
  return webhook;
}

client.on('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Watching channel : ${SOURCE_CHANNEL_ID}`);
  console.log(`Keywords         : ${KEYWORDS.join(', ')}`);
  console.log(`Relaying to      : ${TARGET_CHANNEL_ID}`);
});

client.on('messageCreate', async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Only monitor the source channel
  if (message.channel.id !== SOURCE_CHANNEL_ID) return;

  const content = message.content;
  const lower = content.toLowerCase();

  // Check if any keyword is present
  const matched = KEYWORDS.find(kw => lower.includes(kw));
  if (!matched) {
    console.log(`[SKIP] No keywords found in message: "${content.slice(0, 80)}..."`);
    return;
  }

  console.log(`[RELAY] Keyword "${matched}" matched — from ${message.author.username}: "${content.slice(0, 80)}..."`);

  try {
    const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!targetChannel || !targetChannel.isTextBased()) {
      console.error('[ERROR] Target channel not found or not text-based');
      return;
    }

    const webhook = await getOrCreateWebhook(targetChannel);
    await webhook.send({
      content: content,
      username: message.author.username,
      avatarURL: message.author.displayAvatarURL()
    });

    console.log(`[OK] Relayed successfully to ${TARGET_CHANNEL_ID}`);
  } catch (err) {
    console.error('[ERROR] Failed to relay message:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
