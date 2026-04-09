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

// Deduplication — track recently relayed message IDs
const recentlyRelayed = new Set();

// Minimum score required to relay — filters out low-context standalone oil/crude mentions
const MIN_RELAY_SCORE = 2;

// Keywords that trigger initial scan (broad net)
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
  { word: 'iran',      score: 2 }, // any Iran headline is relevant
  { word: 'conflict',  score: 1 },
  { word: 'tension',   score: 1 },
  // Commodity/supply
  { word: 'crude',     score: 1 },
  { word: 'oil',       score: 1 },
];

// De-escalation phrases — these reduce the score when present
// e.g. "no nuclear weapons", "strait will stay open", "ceasefire agreed"
const DEESCALATION_PHRASES = [
  "won't be", "will not", "no nuclear", "not nuclear",
  "stay open", "remain open", "secure", "ceasefire",
  "peace", "agreement", "deal", "signed", "resolved",
  "comply", "compliance", "de-escalat", "pull back",
  "withdraw", "no war", "avoid war",
  // Non-oil shipping context (dry cargo ≠ oil market impact)
  "dry cargo", "bulk carrier", "grain", "wheat", "coal cargo",
  "container ship", "cargo ship"
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

  // Apply de-escalation modifier — each phrase found reduces score by 2
  let deescalationHits = 0;
  for (const phrase of DEESCALATION_PHRASES) {
    if (lower.includes(phrase)) {
      deescalationHits++;
    }
  }
  if (deescalationHits > 0) {
    const reduction = deescalationHits * 2;
    console.log(`[SCORE] De-escalation phrases found (${deescalationHits}), reducing score by ${reduction}`);
    totalScore = Math.max(1, totalScore - reduction);
  }

  return { totalScore, matchedWords };
}

function getImpactEmoji(score) {
  if (score >= 5) return '🔴';
  if (score >= 3) return '🔴';
  if (score >= 2) return '🟡';
  return '🟢';
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
  // Strip "NEWS BY ..." attribution lines
  const raw = parts.join('\n');
  const cleaned = raw
    .split('\n')
    .filter(line => !/^news by\s/i.test(line.trim()))
    .join('\n')
    .trim();
  return cleaned;
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

  // Deduplicate — skip if we've already relayed this message
  if (recentlyRelayed.has(message.id)) return;
  recentlyRelayed.add(message.id);
  setTimeout(() => recentlyRelayed.delete(message.id), 60000);

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
  const emoji = getImpactEmoji(totalScore);

  // Skip if below minimum quality threshold
  if (totalScore < MIN_RELAY_SCORE) {
    console.log(`[SKIP] Score too low (${totalScore} < ${MIN_RELAY_SCORE}): "${searchableText.slice(0, 100)}"`);
    return;
  }

  console.log(`[RELAY] Score=${totalScore} keywords=[${matchedWords.join(', ')}] from ${message.author.username}`);

  try {
    const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!targetChannel || !targetChannel.isTextBased()) {
      console.error('[ERROR] Target channel not found or not text-based');
      return;
    }

    const webhook = await getOrCreateWebhook(targetChannel);

    // Prepend emoji to the first line only
    const lines = searchableText.split('\n');
    lines[0] = `${emoji} ${lines[0]}`;
    const finalContent = lines.join('\n');

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
