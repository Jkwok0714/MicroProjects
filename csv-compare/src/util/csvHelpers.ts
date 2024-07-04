import { CsvReturnData, CsvRow } from './otherTypes';

/** CSV helper courtesy chatGPT 3.5 */
export function parseCSV(file: File): Promise<CsvReturnData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      if (!event.target) {
        reject(new Error('Failed to read file'));
        return;
      }

      const csvData: CsvRow[] = [];
      const { result } = event.target;

      if (typeof result !== 'string') {
        reject(new Error('File content is not string'));
        return;
      }

      // Split CSV by lines
      const lines = result.split(/\r\n|\n/);

      if (lines.length < 2) {
        reject(new Error('Invalid CSV format'));
        return;
      }

      const headers = lines[0].split(',').map((h) => (h ?? '-').trim());

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');

        const row: CsvRow = {};
        headers.forEach((header, index) => {
          if (!header) return;
          row[header] = values[index]?.trim() ?? '-';
        });
        csvData.push(row);
      }

      resolve({ headers, rows: csvData, fileName: file.name });
    };

    reader.onerror = () => {
      reject(reader.error || new Error('Error reading file'));
    };

    reader.readAsText(file);
  });
}
