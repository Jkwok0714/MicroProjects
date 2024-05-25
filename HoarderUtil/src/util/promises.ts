import { chunkArray } from './helpers';

type Resolvable<R> = R | PromiseLike<R>;

const map = async <T, R>(
  items: readonly T[],
  callback: (item: T, idx: number) => Resolvable<R>,
  options?: { concurrency?: number }
) => {
  const itemsWithIndex = items.map((v, i) => ({ v, i }));
  const batches = options?.concurrency
    ? chunkArray(itemsWithIndex, options.concurrency)
    : [itemsWithIndex];
  const results: R[] = [];

  for (const batch of batches) {
    results.push(
      ...(await Promise.all(batch.map(({ v, i }) => callback(v, i))))
    );
  }

  return results;
};

const mapSeries = async <T, R>(
  items: readonly T[],
  callback: (item: T, index: number) => Resolvable<R>
) => {
  const results: R[] = [];
  let idx = 0;

  for (const item of items) {
    results.push(await callback(item, idx));
    idx++;
  }

  return results;
};

const reduce = async <T, R>(
  items: readonly T[],
  callback: (out: R, item: T, i?: number) => Resolvable<R>,
  init: R
) => {
  let out = init;
  let i = 0;

  for (const item of items) {
    out = await callback(out, item, i);
    i++;
  }

  return out;
};

const each = async <T>(
  items: readonly T[],
  callback: (item: T) => Resolvable<unknown>,
  options?: { concurrency?: number }
) => {
  if (!options?.concurrency || options.concurrency <= 0) {
    for (const item of items) {
      await callback(item);
    }

    return;
  }

  /* Handle concurrency */
  const itemsWithIndex = items.map((v) => ({ v }));
  const batches = chunkArray(itemsWithIndex, options.concurrency);

  for (const batch of batches) {
    await Promise.all(batch.map(({ v }) => callback(v)));
  }
};

const filter = async <T>(
  items: readonly T[],
  callback: (item: T, index: number) => Resolvable<boolean>
) => {
  const results: T[] = [];
  let idx = 0;

  for (const item of items) {
    const shouldKeep = await callback(item, idx);

    if (shouldKeep) {
      results.push(item);
    }

    idx++;
  }

  return results;
};

/**
 * Stand-in for Bluebird[method]
 * courtesy of Mr. Allister Craig Smith
 */
const promises = {
  map,
  mapSeries,
  reduce,
  each,
  filter,
};

export default promises;
