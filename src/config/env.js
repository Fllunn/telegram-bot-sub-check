import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Validates and exports environment configuration
 */
function validateEnv() {
  const botToken = process.env.BOT_TOKEN;
  const requiredChannels = process.env.REQUIRED_CHANNELS;
  const accessLink = process.env.ACCESS_LINK;

  // Validate BOT_TOKEN
  if (!botToken || botToken.trim() === '') {
    console.error('❌ Ошибка: BOT_TOKEN не установлен в файле .env');
    console.error('   Пожалуйста, установите переменную окружения BOT_TOKEN');
    process.exit(1);
  }

  // Validate REQUIRED_CHANNELS
  if (!requiredChannels || requiredChannels.trim() === '') {
    console.error('❌ Ошибка: REQUIRED_CHANNELS не установлен в файле .env');
    console.error('   Пожалуйста, установите REQUIRED_CHANNELS как список каналов через запятую (например: @channel_one,@channel_two)');
    process.exit(1);
  }

  // Validate ACCESS_LINK
  if (!accessLink || accessLink.trim() === '') {
    console.error('❌ Ошибка: ACCESS_LINK не установлен в файле .env');
    console.error('   Пожалуйста, установите переменную окружения ACCESS_LINK');
    process.exit(1);
  }

  return true;
}

/**
 * Normalizes channel identifier from various formats to @username or numeric ID
 * Converts https://t.me/channel_name to @channel_name
 * @param {string} channel - Channel identifier in any format
 * @returns {string} Normalized channel identifier
 */
function normalizeChannel(channel) {
  // Handle https://t.me/channel_name format
  if (channel.includes('https://t.me/')) {
    const match = channel.match(/https:\/\/t\.me\/([\w@]+)/);
    if (match && match[1]) {
      const name = match[1];
      return name.startsWith('@') ? name : `@${name}`;
    }
  }
  
  // Handle t.me/channel_name format
  if (channel.includes('t.me/')) {
    const match = channel.match(/t\.me\/([\w@]+)/);
    if (match && match[1]) {
      const name = match[1];
      return name.startsWith('@') ? name : `@${name}`;
    }
  }
  
  // Handle @channel_name format - ensure @ prefix
  if (channel.startsWith('@')) {
    return channel;
  }
  
  // Handle numeric ID format (starts with - for private channels)
  if (/^-?\d+$/.test(channel)) {
    return channel;
  }
  
  // If no @ prefix for username, add it
  if (!channel.startsWith('-') && !/^\d+$/.test(channel)) {
    return `@${channel}`;
  }
  
  return channel;
}

/**
 * Parses REQUIRED_CHANNELS from comma-separated string to array
 * Supports both @username and numeric chat_id formats
 * Normalizes various URL formats
 * @returns {string[]} Array of channel identifiers
 */
function parseRequiredChannels() {
  const channelsString = process.env.REQUIRED_CHANNELS || '';
  return channelsString
    .split(',')
    .map(ch => ch.trim())
    .filter(ch => ch.length > 0)
    .map(ch => normalizeChannel(ch));
}

/**
 * Parses ADMIN_IDS from comma-separated string to array of numbers
 * @returns {number[]} Array of admin user IDs
 */
function parseAdminIds() {
  const adminIdsString = process.env.ADMIN_IDS || '';
  if (!adminIdsString.trim()) {
    return [];
  }
  
  return adminIdsString
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id));
}

// Validate environment on module load
validateEnv();

// Export configuration
export const config = {
  botToken: process.env.BOT_TOKEN.trim(),
  requiredChannels: parseRequiredChannels(),
  accessLink: process.env.ACCESS_LINK.trim(),
  adminIds: parseAdminIds(),
};

/**
 * Checks if user is admin
 * @param {number} userId - Telegram user ID
 * @returns {boolean} True if user is admin
 */
export function isAdmin(userId) {
  return config.adminIds.includes(userId);
}

export default config;
