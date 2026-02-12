/**
 * Telegram Bot Authentication Script
 *
 * Validates the BOT_TOKEN from .env by calling getMe().
 * Prints bot info on success, setup instructions if no token.
 *
 * Usage: npx tsx src/telegram-auth.ts
 */
import { Bot } from 'grammy';

const token = process.env.BOT_TOKEN || '';

async function validate(): Promise<void> {
  if (!token) {
    console.log('No BOT_TOKEN found in environment.\n');
    console.log('Setup instructions:');
    console.log('  1. Open Telegram and message @BotFather');
    console.log('  2. Send /newbot and follow the prompts');
    console.log('  3. Copy the token BotFather gives you');
    console.log('  4. Add BOT_TOKEN=<your-token> to your .env file');
    console.log('  5. Run this script again to verify\n');
    console.log('Important bot settings (via @BotFather):');
    console.log('  /setprivacy → Disable (so bot sees all group messages)');
    console.log('  /setjoingroups → Enable');
    process.exit(1);
  }

  const bot = new Bot(token);
  const me = await bot.api.getMe();

  console.log(`\nBot authenticated successfully!`);
  console.log(`  Username: @${me.username}`);
  console.log(`  ID:       ${me.id}`);
  console.log(`  Name:     ${me.first_name}\n`);
  console.log('You can now start NanoClaw with: npm run dev');
}

validate().catch((err) => {
  console.error('Authentication failed:', err.message);
  process.exit(1);
});
