import { Card, CardBody, Input } from '@chakra-ui/react';
import { useCallback } from 'react';
import { parseCSV } from '../util/csvHelpers';
import { CsvReturnData, CsvRow } from '../util/otherTypes';

type Props = {
  onCsvData: (data: CsvReturnData) => void;
};

function ChooseFile({ onCsvData }: Props) {
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const returnData = await parseCSV(file);
        onCsvData(returnData);
      } catch (error) {
        console.error('Error parsing CSV:', error);
      }
    },
    []
  );

  return (
    <Card w="50%" minW="500px">
      <CardBody>
        Choose one
        <Input
          placeholder="Select CSV"
          onChange={handleFileSelect}
          type="file"
        />
      </CardBody>
    </Card>
  );
}

export default ChooseFile;
