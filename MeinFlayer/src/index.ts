import mineflayer from 'mineflayer';
import defaultPersonas from './personas';

const options: mineflayer.BotOptions = {
  host: 'localhost', // Change this to the ip you want.
  port: 62228, // Change this to the port you want.
  username: 'F.L.A.Y.E.R',
};

const bot = mineflayer.createBot(options);

defaultPersonas.farmer(bot);
