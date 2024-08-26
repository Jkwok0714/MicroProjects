import mineflayer from 'mineflayer';
import vec3 from 'vec3';

export default function applyDigger(bot: mineflayer.Bot) {
  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    switch (message) {
      case 'loaded':
        await bot.waitForChunksToLoad();
        bot.chat('Ready!');
        break;
      case 'list':
        sayItems();
        break;
      case 'dig':
        dig();
        break;
      case 'build':
        build();
        break;
      case 'equip dirt':
        equipDirt();
        break;
    }
  });

  function sayItems(items = bot.inventory.items()) {
    const output = items.map(itemToString).join(', ');
    if (output) {
      bot.chat(output);
    } else {
      bot.chat('empty');
    }
  }

  async function dig() {
    let target;
    if (bot.targetDigBlock) {
      bot.chat(`already digging ${bot.targetDigBlock.name}`);
    } else {
      target = bot.blockAt(bot.entity.position.offset(0, -1, 0));
      if (target && bot.canDigBlock(target)) {
        bot.chat(`starting to dig ${target.name}`);
        try {
          await bot.dig(target);
          bot.chat(`finished digging ${target.name}`);
        } catch (err) {
          console.log(err.stack);
        }
      } else {
        bot.chat('cannot dig');
      }
    }
  }

  function build() {
    const referenceBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
    const jumpY = Math.floor(bot.entity.position.y) + 1.0;
    bot.setControlState('jump', true);
    bot.on('move', placeIfHighEnough);

    let tryCount = 0;

    async function placeIfHighEnough() {
      if (bot.entity.position.y > jumpY) {
        try {
          await bot.placeBlock(referenceBlock, vec3(0, 1, 0));
          bot.setControlState('jump', false);
          bot.removeListener('move', placeIfHighEnough);
          bot.chat('Placing a block was successful');
        } catch (err) {
          tryCount++;
          if (tryCount > 10) {
            bot.chat(err.message);
            bot.setControlState('jump', false);
            bot.removeListener('move', placeIfHighEnough);
          }
        }
      }
    }
  }

  async function equipDirt() {
    let itemsByName;
    if (bot.supportFeature('itemsAreNotBlocks')) {
      itemsByName = 'itemsByName';
    } else if (bot.supportFeature('itemsAreAlsoBlocks')) {
      itemsByName = 'blocksByName';
    }
    try {
      await bot.equip(bot.registry[itemsByName].dirt.id, 'hand');
      bot.chat('equipped dirt');
    } catch (err) {
      bot.chat(`unable to equip dirt: ${err.message}`);
    }
  }

  function itemToString(item) {
    if (item) {
      return `${item.name} x ${item.count}`;
    } else {
      return '(nothing)';
    }
  }
}
