import { useCallback, useState } from 'react';
import { Box, Heading } from '@chakra-ui/react';
import './App.css';
import ChooseFile from './components/ChooseFile';
import TableDisplay from './components/TableDisplay';
import { CsvReturnData, View } from './util/otherTypes';

function App() {
  const [view, setView] = useState<View>(View.Select);
  const [csvData, setCsvData] = useState<CsvReturnData | null>(null);

  const onCsvData = useCallback((csvData: CsvReturnData) => {
    setCsvData(csvData);
    setView(View.Table);
  }, []);

  return (
    <Box className="App">
      <Heading className="App-header">CSV lands</Heading>
      {view === View.Select || !csvData?.rows ? (
        <ChooseFile onCsvData={onCsvData} />
      ) : (
        <TableDisplay csvData={csvData} />
      )}
    </Box>
  );
}

export default App;
