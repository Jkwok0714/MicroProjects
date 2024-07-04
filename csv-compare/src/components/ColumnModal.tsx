import { Table } from '@tanstack/react-table';
import { CsvRow } from '../util/otherTypes';
import BasicModal, { BasicModalProps } from './common/BasicModal';

interface ColumnModalProps extends Omit<BasicModalProps, 'title' | 'children'> {
  table: Table<CsvRow>;
}

const ColumnModal: React.FC<ColumnModalProps> = ({ table, ...modalProps }) => {
  return (
    <BasicModal title="Select columns" {...modalProps}>
      <div className="px-1 border-b border-black">
        <label>
          <input
            {...{
              type: 'checkbox',
              checked: table.getIsAllColumnsVisible(),
              onChange: table.getToggleAllColumnsVisibilityHandler(),
            }}
          />{' '}
          Toggle All
        </label>
      </div>
      {table.getAllLeafColumns().map((column) => {
        return (
          <div key={column.id} className="px-1">
            <label>
              <input
                {...{
                  type: 'checkbox',
                  checked: column.getIsVisible(),
                  onChange: column.getToggleVisibilityHandler(),
                }}
              />{' '}
              {column.id}
            </label>
          </div>
        );
      })}
    </BasicModal>
  );
};

export default ColumnModal;
