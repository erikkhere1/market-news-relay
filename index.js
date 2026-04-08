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

// Keywords that trigger the relay filter
const FILTER_KEYWORDS = ['iran', 'strait', 'oil', 'crude', 'war'];

// Scoring keywords — weighted by expected market impact
const SCORING_KEYWORDS = [
  // Critical supply shock signals
  { word: 'strait',    score: 3 },
  { word: 'war',       score: 3 },
  // Escalation signals
  { word: 'attack',    score: 2 },
  { word: 'strike',    score: 2 },
  { word: 'missile',   score: 2 },
  { word: 'explosion', score: 2 },
  { word: 'bomb',      score: 2 },
  { word: 'blockade',  score: 2 },
  { word: 'invasion',  score: 2 },
  { word: 'sanction',  score: 2 },
  { word: 'embargo',   score: 2 },
  { word: 'nuclear',   score: 2 },
  // Geopolitical context
  { word: 'iran',      score: 1 },
  { word: 'conflict',  score: 1 },
  { word: 'tension',   score: 1 },
  // Commodity/supply
  { word: 'crude',     score: 1 },
  { word: 'oil',       score: 1 },
];

function scoreMessage(text) {
  const lower = text.toLowerCase();
  let totalScore = 0;
  const matchedWords = [];

  for (const { word, score } of SCORING_KEYWORDS) {
    if (lower.includes(word)) {
      totalScore += score;
      matchedWords.push(word);
    }
  }

  return { totalScore, matchedWords };
}

function getImpactLabel(score) {
  if (score >= 5) return { emoji: '🔴🔴', label: 'CRITICAL' };
  if (score >= 3) return { emoji: '🔴',   label: 'HIGH' };
  if (score >= 2) return { emoji: '🟡',   label: 'MODERATE' };
  return              { emoji: '🟢',   label: 'LOW' };
}

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
      if (embed.title)       parts.push(embed.title);
      if (embed.description) parts.push(embed.description);
      if (embed.author?.name) parts.push(embed.author.name);
      if (embed.footer?.text) parts.push(embed.footer.text);
      if (embed.fields?.length) {
        for (const field of embed.fields) {
          if (field.name)  parts.push(field.name);
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
  console.log(`Filter keywords  : ${FILTER_KEYWORDS.join(', ')}`);
  console.log(`Relaying to      : ${TARGET_CHANNEL_ID}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.id === client.user.id) return;
  if (message.channel.id !== SOURCE_CHANNEL_ID) return;

  const searchableText = extractSearchableText(message);
  const lower = searchableText.toLowerCase();

  // Check filter keywords first
  const matched = FILTER_KEYWORDS.find(kw => lower.includes(kw));
  if (!matched) {
    console.log(`[SKIP] No filter keyword found: "${searchableText.slice(0, 100)}"`);
    return;
  }

  // Score the message
  const { totalScore, matchedWords } = scoreMessage(searchableText);
  const { emoji, label } = getImpactLabel(totalScore);

  console.log(`[RELAY] Score=${totalScore} (${label}) keywords=[${matchedWords.join(', ')}] from ${message.author.username}`);

  try {
    const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!targetChannel || !targetChannel.isTextBased()) {
      console.error('[ERROR] Target channel not found or not text-based');
      return;
    }

    const webhook = await getOrCreateWebhook(targetChannel);

    const header = `${emoji} **${label}**  |  ${matchedWords.join(' · ')}\n${'━'.repeat(32)}`;
    const finalContent = `${header}\n${searchableText}`;

    await webhook.send({
      content: finalContent,
      username: message.author.username,
      avatarURL: message.author.displayAvatarURL()
    });

    console.log(`[OK] Relayed successfully to ${TARGET_CHANNEL_ID}`);
  } catch (err) {
    console.error('[ERROR] Failed to relay message:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
