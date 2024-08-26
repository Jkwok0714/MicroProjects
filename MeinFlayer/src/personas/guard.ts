import mineflayer from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';

export default function applyGuard(bot: mineflayer.Bot) {
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  let guardPos = null;

  // Assign the given location to be guarded
  function guardArea(pos) {
    guardPos = pos;

    // We we are not currently in combat, move to the guard pos
    if (!bot.pvp.target) {
      moveToGuardPos();
    }
  }

  // Cancel all pathfinder and combat
  function stopGuarding() {
    guardPos = null;
    bot.pvp.stop();
    bot.pathfinder.setGoal(null);
  }

  // Pathfinder to the guard position
  function moveToGuardPos() {
    bot.pathfinder.setMovements(new Movements(bot));
    bot.pathfinder.setGoal(
      new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z)
    );
  }

  // Called when the bot has killed it's target.
  bot.on('stoppedAttacking' as any, () => {
    if (guardPos) {
      moveToGuardPos();
    }
  });

  // Check for new enemies to attack
  bot.on('physicsTick', () => {
    if (!guardPos) return; // Do nothing if bot is not guarding anything

    // Only look for mobs within 16 blocks
    const filter = (e) =>
      e.type === 'mob' &&
      e.position.distanceTo(bot.entity.position) < 16 &&
      e.displayName !== 'Armor Stand'; // Mojang classifies armor stands as mobs for some reason?

    const entity = bot.nearestEntity(filter);
    if (entity) {
      // Start attacking
      bot.pvp.attack(entity);
    }
  });

  // Listen for player commands
  bot.on('chat', (username, message) => {
    // Guard the location the player is standing
    if (message === 'guard') {
      const player = bot.players[username];

      if (!player) {
        bot.chat("I can't see you.");
        return;
      }

      bot.chat('I will guard that location.');
      guardArea(player.entity.position);
    }

    // Stop guarding
    if (message === 'stop') {
      bot.chat('I will no longer guard this area.');
      stopGuarding();
    }
  });
}
