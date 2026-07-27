type StringListEditorProps = {
  title: string;
  hint: string;
  values: string[];
  disabled?: boolean;
  onChange: (values: string[]) => void;
};

export function StringListEditor({ title, hint, values, disabled = false, onChange }: StringListEditorProps) {
  const updateValue = (index: number, nextValue: string) => {
    onChange(values.map((value, valueIndex) => (valueIndex === index ? nextValue : value)));
  };

  const addValue = () => {
    onChange([...values, ""]);
  };

  const removeValue = (index: number) => {
    onChange(values.filter((_, valueIndex) => valueIndex !== index));
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">List Editor</p>
          <h2>{title}</h2>
        </div>
        <button className="secondary-button" disabled={disabled} onClick={addValue} type="button">
          Add row
        </button>
      </div>
      <p className="panel-copy">{hint}</p>
      <div className="list-editor">
        {values.length === 0 ? <p className="empty-note">No values yet.</p> : null}
        {values.map((value, index) => (
          <div className="list-row" key={`${title}-${index}`}>
            <input
              className="text-input"
              disabled={disabled}
              onChange={(event) => updateValue(index, event.target.value)}
              placeholder="Enter value"
              value={value}
            />
            <button className="icon-button" disabled={disabled} onClick={() => removeValue(index)} type="button">
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

