import {
    createContext,
    useContext,
    useState,
  } from "react";
  
  import type { ReactNode } from "react";
  
  type ToastType = "success" | "error" | "info";
  
  interface Toast {
    id: string;
    type: ToastType;
    message: string;
  }
  
  interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
  }
  
  const ToastContext = createContext<
    ToastContextType | undefined
  >(undefined);
  
  export function ToastProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
  
    function showToast(
      message: string,
      type: ToastType = "info"
    ) {
      const id = crypto.randomUUID();
  
      const newToast: Toast = {
        id,
        message,
        type,
      };
  
      setToasts((prev) => [...prev, newToast]);
  
      setTimeout(() => {
        setToasts((prev) =>
          prev.filter((t) => t.id !== id)
        );
      }, 3000);
    }
  
    return (
      <ToastContext.Provider value={{ showToast }}>
        {children}
  
        {/* TOAST CONTAINER */}
        <div className="fixed top-4 right-4 space-y-2 z-50">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2 rounded shadow text-white text-sm
                ${
                  toast.type === "success"
                    ? "bg-emerald-600"
                    : toast.type === "error"
                    ? "bg-red-600"
                    : "bg-slate-800"
                }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    );
  }
  
  export function useToast() {
    const context = useContext(ToastContext);
  
    if (!context) {
      throw new Error(
        "useToast must be used inside ToastProvider"
      );
    }
  
    return context;
  }