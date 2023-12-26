import * as colors from 'colors/safe';
import { resolve } from 'path';

import output from '../util/output';
import { NiHaoTestFlags } from '../util/types';
import { getFileList } from '../util/files';

/**
 * Hello whirl for testing
 */
const nihao = async ({ commandArgs = [], quick }: NiHaoTestFlags) => {
  output.out(colors.rainbow(`您好！ Salve! Hola! ${commandArgs[0] ?? ''}`));

  if (quick) {
    const fileList = await getFileList(resolve('.'));

    output.out(
      `Activated in a directory with ${fileList.length} files, including ${
        fileList?.[0] ?? colors.red('nothing')
      }.`
    );
  }

  output.out(colors.bold('Now GTFO\n\n'));
};

export default nihao;
