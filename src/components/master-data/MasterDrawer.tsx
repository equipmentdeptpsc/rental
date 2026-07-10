import type {
    ReactNode,
  } from "react";
  
  interface Props {
  
    open: boolean;
  
    title: string;
  
    children: ReactNode;
  
    onClose(): void;
  
  }
  
  export default function MasterDrawer({
  
    open,
  
    title,
  
    children,
  
    onClose,
  
  }: Props) {
  
    if (!open) {
  
      return null;
  
    }
  
    return (
  
      <div className="fixed inset-0 z-50 flex">
  
        <div
          className="flex-1 bg-black/40"
          onClick={onClose}
        />
  
        <div className="w-full max-w-xl bg-white shadow-xl overflow-y-auto">
  
          <div className="flex items-center justify-between border-b p-4">
  
            <h2 className="text-lg font-semibold">
  
              {title}
  
            </h2>
  
            <button
              onClick={onClose}
              className="rounded border px-3 py-1"
            >
  
              Close
  
            </button>
  
          </div>
  
          <div className="p-6">
  
            {children}
  
          </div>
  
        </div>
  
      </div>
  
    );
  
  }