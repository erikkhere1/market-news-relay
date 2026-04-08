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

function extractSearchableText(message) {
  const parts = [];

  if (message.content) parts.push(message.content);

  if (message.embeds?.length) {
    for (const embed of message.embeds) {
      if (embed.title) parts.push(embed.title);
      if (embed.description) parts.push(embed.description);
      if (embed.author?.name) parts.push(embed.author.name);
      if (embed.footer?.text) parts.push(embed.footer.text);

      if (embed.fields?.length) {
        for (const field of embed.fields) {
          if (field.name) parts.push(field.name);
          if (field.value) parts.push(field.value);
        }
      }
    }
  }

  return parts.join('\n');
}

client.on('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Watching channel : ${SOURCE_CHANNEL_ID}`);
  console.log(`Keywords         : ${KEYWORDS.join(', ')}`);
  console.log(`Relaying to      : ${TARGET_CHANNEL_ID}`);
});

client.on('messageCreate', async (message) => {
  // Ignore ONLY this bot's own messages to prevent loops
  if (message.author.id === client.user.id) return;

  // Only monitor the source channel
  if (message.channel.id !== SOURCE_CHANNEL_ID) return;

  const searchableText = extractSearchableText(message);
  const lower = searchableText.toLowerCase();

  const matched = KEYWORDS.find(kw => lower.includes(kw));
  if (!matched) {
    console.log(
      `[SKIP] No keywords found. author=${message.author.username} bot=${message.author.bot} webhook=${message.webhookId ? 'yes' : 'no'} content="${searchableText.slice(0, 120)}"`
    );
    return;
  }

  console.log(
    `[RELAY] Keyword "${matched}" matched — from ${message.author.username} bot=${message.author.bot} webhook=${message.webhookId ? 'yes' : 'no'}: "${searchableText.slice(0, 120)}"`
  );

  try {
    const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!targetChannel || !targetChannel.isTextBased()) {
      console.error('[ERROR] Target channel not found or not text-based');
      return;
    }

    const webhook = await getOrCreateWebhook(targetChannel);
    await webhook.send({
      content: searchableText,
      username: message.author.username,
      avatarURL: message.author.displayAvatarURL()
    });

    console.log(`[OK] Relayed successfully to ${TARGET_CHANNEL_ID}`);
  } catch (err) {
    console.error('[ERROR] Failed to relay message:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);