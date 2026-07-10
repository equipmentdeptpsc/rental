interface Props {

    keyword: string;
  
    onKeywordChange(
      value: string
    ): void;
  
    onCreate(): void;
  
    createLabel?: string;
  
  }
  
  export default function MasterToolbar({
  
    keyword,
  
    onKeywordChange,
  
    onCreate,
  
    createLabel = "New",
  
  }: Props) {
  
    return (
  
      <div className="rounded-xl border bg-white p-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
  
        <input
  
          type="text"
  
          placeholder="Search..."
  
          value={keyword}
  
          onChange={(e) =>
            onKeywordChange(
              e.target.value
            )
          }
  
          className="rounded border px-3 py-2 w-full md:w-80"
  
        />
  
        <button
  
          onClick={onCreate}
  
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
  
        >
  
          + {createLabel}
  
        </button>
  
      </div>
  
    );
  
  }