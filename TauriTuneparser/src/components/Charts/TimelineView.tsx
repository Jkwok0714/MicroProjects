import { useMemo } from 'react';
import {
  Tooltip,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Area,
} from 'recharts';

import useCallComposer from 'src/hooks/useCallComposer';
import { Graphs } from 'src/types/types';
import { Classifications } from 'src/utils/configs';
import { DUSK } from 'src/utils/palettes';
import ResponsiveContainer from './generics/ResponsiveContainer';
import Spinner from '../common/Spinner';

type DataPoint = {
  name: string;
  [line: Exclude<string, 'name'>]: number | string;
};

const CHART_SIZE = 400;

export default function TimelineView() {
  const { data1, loading } = useCallComposer<DataPoint>(Graphs.addedTimeline);

  const potentialCategories = useMemo(
    () => [
      ...Classifications.get()
        .split(',')
        .filter((c) => c !== ''),
      'media',
    ],
    []
  );

  if (loading) return <Spinner />;

  return (
    <ResponsiveContainer>
      <AreaChart
        width={CHART_SIZE * 2}
        height={CHART_SIZE}
        data={data1}
        margin={{
          top: 10,
          right: 30,
          left: 0,
          bottom: 0,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis scale="sqrt" />
        <Tooltip />
        {potentialCategories.map((cat, i) => (
          <Area
            key={cat}
            type="monotone"
            dataKey={cat}
            stackId="1"
            fill={DUSK[i % DUSK.length]}
            stroke={DUSK[i % DUSK.length]}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
