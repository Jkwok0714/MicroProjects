import { GenrePieType, Graphs, MediaRecord } from 'src/types/types';
import { Composer_InboundMessage } from './workers.types';
import { handleError, handleMessage } from './workers.helpers';
import { VideoIncludeSettings } from 'src/utils/configs';
import { sortByKey } from 'src/utils/helpers';

type Options = Composer_InboundMessage['options'];

addEventListener(
  'message',
  (message: MessageEvent<Composer_InboundMessage>) => {
    const { graph, data, options } = message.data;

    switch (graph) {
      case Graphs.genrePie:
        handleMessage(getGenrePie(data, options));
        return;
      case Graphs.genrePlays:
        handleMessage(getGenrePie(data, options, GenrePieType.plays));
        return;
      case Graphs.genreArtists:
        handleMessage(getGenrePie(data, options, GenrePieType.artists));
        return;
      case Graphs.addedTimeline:
        handleMessage(getAddedTimeline(data, options));
        return;
      case Graphs.groupingsPie:
        handleMessage(getGroupingPie(data, options));
        return;
      default:
        return handleError('Unsupported graph type');
    }
  }
);

type CounterMap = Record<string, number>;

const increment = (record: CounterMap, key: string, amount = 1) =>
  record[key] ? (record[key] += amount) : (record[key] = amount);

/** Convert to pie graph's required data format */
const transformToArray = (record: CounterMap) =>
  Object.entries(record).map(([name, value]) => ({ name, value }));

const shouldExcludeMedia = (media: MediaRecord, opts: Options) => {
  const { hasVideo } = media;
  const { videoSettings } = opts;

  if (
    (hasVideo && videoSettings === VideoIncludeSettings.exclude) ||
    (!hasVideo && videoSettings === VideoIncludeSettings.only)
  )
    return true;

  return false;
};

const getGroupingPie = (data: MediaRecord[], opts: Options) => {
  const groupMap: CounterMap = {};

  const artistDeduper = new Set<string>();

  data.forEach((media) => {
    const { grouping, artist } = media;

    if (shouldExcludeMedia(media, opts)) return;

    if (!grouping) return;

    const groups = grouping.split(',');

    groups.forEach((group) => {
      const dedupeKey = `${group}-${artist}`;

      if (artistDeduper.has(dedupeKey)) return;
      increment(groupMap, group);
      artistDeduper.add(dedupeKey);
    });
  });

  return {
    data1: sortByKey(transformToArray(groupMap), 'value', false),
  };
};

const getAddedTimeline = (data: MediaRecord[], opts: Options) => {
  const { classifications } = opts;

  const dateMap: Record<string, CounterMap> = {};

  const parsedClassifications = classifications
    .split(',')
    .filter((s) => s.length > 1);

  data.forEach((media) => {
    const { genre, dateAdded } = media;

    if (shouldExcludeMedia(media, opts)) return;

    if (!dateAdded) return;

    /** We expect ISO formatted date strings. Only want YYYY-MM */
    const date = dateAdded.substring(0, 7);

    const belongsToClass =
      parsedClassifications.find((c) =>
        genre?.toLowerCase().includes(c.toLowerCase())
      ) ?? 'media';

    if (!dateMap[date]) dateMap[date] = {};

    increment(dateMap[date], belongsToClass);
  });

  return {
    data1: Object.keys(dateMap)
      .sort()
      .map((d) => ({ ...dateMap[d], name: d })),
  };
};

const getGenrePie = (
  data: MediaRecord[],
  opts: Options,
  type = GenrePieType.songs
) => {
  const { classifications } = opts;

  const parsedClassifications = classifications
    .split(',')
    .filter((s) => s.length > 1);

  const byPlays = type === GenrePieType.plays;
  const byArtists = type === GenrePieType.artists;

  const allGenres: CounterMap = {};
  const genreClass: CounterMap = {};

  const artistDeduper = new Set<string>();

  let total = 0;

  data.forEach((media) => {
    const { genre, plays, artist } = media;

    if (shouldExcludeMedia(media, opts)) return;

    if (byPlays && (!plays || plays === 0)) return;

    const genreLabel = genre ?? 'Unknown genre';

    if (parsedClassifications.length === 0) {
      increment(allGenres, genreLabel);
      return;
    }

    const belongsToClass = parsedClassifications.find((c) =>
      genre?.toLowerCase().includes(c.toLowerCase())
    );

    if (byArtists) {
      const dedupeKey = `${genreLabel}-${artist}`;
      if (artistDeduper.has(dedupeKey)) return;
      artistDeduper.add(dedupeKey);
    }

    const incrementAmount = byPlays ? plays : 1;

    const classLabel = belongsToClass ?? 'Other';
    increment(allGenres, `${classLabel}: ` + genreLabel, incrementAmount);
    increment(genreClass, classLabel, incrementAmount);

    total += incrementAmount;
  });

  const genreClassArr = sortByKey(transformToArray(genreClass), 'name');

  return {
    data1: sortByKey(transformToArray(allGenres), 'name'),
    data2: genreClassArr,
  };
};
