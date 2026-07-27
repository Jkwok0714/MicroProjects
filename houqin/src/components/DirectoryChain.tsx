type DirectoryChainProps = {
  chain: string[];
  disabled: boolean;
  onPickDirectory: (index: number) => void;
  onAddDirectory: () => void;
  onRemoveDirectory: (index: number) => void;
};

export function DirectoryChain({
  chain,
  disabled,
  onPickDirectory,
  onAddDirectory,
  onRemoveDirectory,
}: DirectoryChainProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Directory Topology</p>
          <h2>Migration chain</h2>
        </div>
        <button className="secondary-button" disabled={disabled} onClick={onAddDirectory} type="button">
          Add step
        </button>
      </div>
      <div className="chain-grid">
        {chain.map((directory, index) => (
          <article className="chain-card" key={`${index}-${directory || "empty"}`}>
            <div className="chain-card-top">
              <span className="chain-index">{index}</span>
              {chain.length > 2 ? (
                <button
                  className="icon-button"
                  disabled={disabled}
                  onClick={() => onRemoveDirectory(index)}
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div>
              <p className="chain-role">
                {index === 0 ? "Source" : index === chain.length - 1 ? "Destination" : "Intermediate"}
              </p>
              <p className="chain-path">{directory || "No directory selected yet"}</p>
            </div>
            <button className="primary-button" disabled={disabled} onClick={() => onPickDirectory(index)} type="button">
              Choose folder
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

