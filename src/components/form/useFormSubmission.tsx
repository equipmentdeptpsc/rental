import { useRef, useState } from "react";
import { useOptionalToast } from "@/components/ui/toast/ToastContext";

export function useFormSubmission<T>(entity:string,onSubmit:(data:T)=>void|Promise<void>){
  const[busy,setBusy]=useState(false),[error,setError]=useState("");const busyRef=useRef(false),errorRef=useRef<HTMLDivElement>(null);const toast=useOptionalToast(),showToast=toast?.showToast??(()=>undefined);
  async function submit(data:T){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError("");try{await onSubmit(data);showToast(`${entity} saved successfully.`,"success");}catch(value){const message=value instanceof Error?value.message:`Unable to save ${entity}.`;setError(message);showToast(message,"error");queueMicrotask(()=>errorRef.current?.focus());}finally{busyRef.current=false;setBusy(false)}}
  function fail(message:string){setError(message);showToast(message,"error");queueMicrotask(()=>errorRef.current?.focus())}
  const feedback=error?<div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"><strong>Unable to save {entity}</strong><span className="mt-1 block">{error}</span></div>:null;
  return{submit,busy,feedback,fail};
}
