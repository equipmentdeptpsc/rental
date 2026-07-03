interface ConfirmModalProps {
    open: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
  
    onConfirm: () => void;
    onCancel: () => void;
  }
  
  export default function ConfirmModal({
    open,
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    loading = false,
    onConfirm,
    onCancel,
  }: ConfirmModalProps) {
    if (!open) return null;
  
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <h2 className="text-lg font-bold text-slate-800">
            {title}
          </h2>
  
          <p className="mt-2 text-sm text-slate-600">
            {message}
          </p>
  
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="rounded px-4 py-2 text-sm border hover:bg-slate-100 disabled:opacity-50"
            >
              {cancelText}
            </button>
  
            <button
              onClick={onConfirm}
              disabled={loading}
              className="rounded px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
            >
              {loading ? "Processing..." : confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  }