export enum View {
  Select,
  Table,
}

export type CsvRow = {
  [key: string]: string;
};

export type CsvReturnData = {
  rows: CsvRow[];
  headers: string[];
};
