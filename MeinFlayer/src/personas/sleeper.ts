import mineflayer from 'mineflayer';

export default function applySleeper(bot: mineflayer.Bot) {
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    switch (message) {
      case 'sleep':
        goToSleep();
        break;
      case 'wakeup':
        wakeUp();
        break;
    }
  });

  bot.on('sleep', () => {
    bot.chat('Good night!');
  });
  bot.on('wake', () => {
    bot.chat('Good morning!');
  });

  async function goToSleep() {
    const bed = bot.findBlock({
      matching: (block) => bot.isABed(block),
    });
    if (bed) {
      try {
        await bot.sleep(bed);
        bot.chat("I'm sleeping");
      } catch (err) {
        bot.chat(`I can't sleep: ${err.message}`);
      }
    } else {
      bot.chat('No nearby bed');
    }
  }

  async function wakeUp() {
    try {
      await bot.wake();
    } catch (err) {
      bot.chat(`I can't wake up: ${err.message}`);
    }
  }
}
