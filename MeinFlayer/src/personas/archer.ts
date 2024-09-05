import mineflayer from 'mineflayer';

export default function applyArcher(bot: mineflayer.Bot) {
  bot.on('spawn', function () {
    bot.chat(
      `/give ${bot.username} crossbow{Enchantments:[{id:quick_charge,lvl:3},{id:unbreaking,lvl:3}]} 1`
    ); // Test with fast charge
    // bot.chat(`/give ${bot.username} crossbow 1`) // Test with slow charge
    bot.chat(`/give ${bot.username} minecraft:arrow 64`);
  });

  bot.on('chat', async (username, message) => {
    if (message === 'fire') {
      // Check if weapon is equipped
      const slotID = bot.getEquipmentDestSlot('hand');
      if (
        bot.inventory.slots[slotID] === null ||
        bot.inventory.slots[slotID].name !== 'crossbow'
      ) {
        const weaponFound = bot.inventory
          .items()
          .find((item) => item.name === 'crossbow');
        if (weaponFound) {
          await bot.equip(weaponFound, 'hand');
        } else {
          console.log('No weapon in inventory');
          return;
        }
      }

      const timeForCharge = 1250 * 250;

      bot.activateItem(); // charge
      await sleep(timeForCharge); // wait for crossbow to charge
      bot.deactivateItem(); // raise weapon

      try {
        bot.lookAt(bot.players[username].entity.position, true);
        await bot.waitForTicks(5); // wait for lookat to finish
        bot.activateItem(); // fire
        bot.deactivateItem();
      } catch (err) {
        bot.chat('Player disappeared, crossbow is charged now.');
      }
    }
  });

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
