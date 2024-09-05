import mineflayer from 'mineflayer';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';

import { plugin as collectBlock } from 'mineflayer-collectblock';
import { goals, Movements } from 'mineflayer-pathfinder';
let mcData;

export default function applyFarmer(bot: mineflayer.Bot) {
  bot.loadPlugin(collectBlock);
  let defaultMove: Movements;

  bot.on('spawn', () => {
    mcData = minecraftData(bot.version);
    defaultMove = new Movements(bot);
  });

  function blockToSow() {
    return bot.findBlock({
      point: bot.entity.position,
      matching: bot.registry.blocksByName.farmland.id,
      maxDistance: 6,
      useExtraInfo: (block) => {
        const blockAbove = bot.blockAt(block.position.offset(0, 1, 0));
        return !blockAbove || blockAbove.type === 0;
      },
    });
  }

  function blockToHarvest() {
    return bot.findBlock({
      point: bot.entity.position,
      maxDistance: 6,
      matching: (block) => {
        return (
          block &&
          block.type === bot.registry.blocksByName.wheat.id &&
          block.metadata === 7
        );
      },
    });
  }

  async function loop() {
    try {
      console.log('starting loop');
      while (1) {
        const entities = bot.entities;

        const nearbyItem = Object.values(entities).find((entity) => {
          return (
            entity.displayName === 'Item' &&
            entity.position.distanceTo(bot.player.entity.position) < 30
          );
        });

        if (nearbyItem) {
          const res = await getEntity(nearbyItem);
          console.log('end get', res);
          if (!res) break;
        } else {
          break;
        }
      }
      console.log('looking to harvest');
      while (1) {
        const toHarvest = blockToHarvest();
        if (toHarvest) {
          await bot.dig(toHarvest);
        } else {
          break;
        }
      }

      console.log('looking to sow');
      while (1) {
        const toSow = blockToSow();
        if (toSow) {
          await bot.equip(bot.registry.itemsByName.wheat_seeds.id, 'hand');
          await bot.placeBlock(toSow, new Vec3(0, 1, 0));
        } else {
          break;
        }
      }
    } catch (e) {
      console.log(e);
    }

    // No block to harvest or sow. Postpone next loop a bit
    setTimeout(loop, 1000);
  }

  async function getEntity(entity: (typeof bot)['entities'][string]) {
    return new Promise(async (resolve) => {
      if (entity.displayName !== 'Item' || !defaultMove) return resolve(false);
      if (entity.position.distanceTo(bot.player.entity.position) > 40)
        return resolve(false);

      bot.pathfinder.setMovements(defaultMove);

      if (bot.pathfinder.goal) return;

      bot.chat('I see ITEMS!!');

      const originalGoal = new goals.GoalNear(
        entity.position.x,
        entity.position.y,
        entity.position.z,
        1
      );

      await bot.pathfinder.setGoal(originalGoal);

      // watch item position

      const itemPolling = setInterval(() => {
        const goal = new goals.GoalNear(
          entity.position.x,
          entity.position.y,
          entity.position.z,
          1
        );

        bot.pathfinder.setGoal(null);
        bot.pathfinder.setGoal(goal);
      }, 2000);

      let cancelled = false;
      const timer = setTimeout(() => {
        bot.chat('Cannot reach item');
        bot.pathfinder.setGoal(null);
        clearInterval(itemPolling);
        resolve(false);
      }, 20 * 1000);

      function onGoalReached() {
        bot.off('goal_reached', onGoalReached);
        clearInterval(itemPolling);
        if (cancelled) return;
        bot.chat('Got my item');
        bot.pathfinder.setGoal(null);
        if (timer) clearTimeout(timer);

        resolve(true);
      }

      // await bot.pathfinder.goto(goal);
      bot.on('goal_reached', onGoalReached);

      // bot.pathfinder.setGoal(null);
    });
  }

  // bot.on('entitySpawn', async (entity) => {
  //   if (entity.displayName !== 'Item') return;
  //   if (entity.position.distanceTo(bot.player.entity.position) > 100) return;

  //   await getEntity(entity);
  // });

  bot.once('login', loop);
}
