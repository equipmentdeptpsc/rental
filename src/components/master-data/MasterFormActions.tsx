interface Props {

    isEditing: boolean;
  
    onSave(): void;
  
    onCancel(): void;
  
  }
  
  export default function MasterFormActions({
  
    isEditing,
  
    onSave,
  
    onCancel,
  
  }: Props) {
  
    return (
  
      <div className="flex justify-end gap-3 pt-6">
  
        <button
  
          type="button"
  
          onClick={onCancel}
  
          className="rounded border px-4 py-2"
  
        >
  
          Cancel
  
        </button>
  
        <button
  
          type="button"
  
          onClick={onSave}
  
          className="rounded bg-blue-600 px-4 py-2 text-white"
  
        >
  
          {isEditing
            ? "Update"
            : "Save"}
  
        </button>
  
      </div>
  
    );
  
  }