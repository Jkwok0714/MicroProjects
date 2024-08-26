import applyArcher from './archer';
import applyDigger from './digger';
import applyFarmer from './farmer';
import applyGuard from './guard';
import applyInventory from './inventory';

const defaultPersonas = {
  digger: applyDigger,
  archer: applyArcher,
  farmer: applyFarmer,
  guard: applyGuard,
  inventory: applyInventory,
};

export default defaultPersonas;
