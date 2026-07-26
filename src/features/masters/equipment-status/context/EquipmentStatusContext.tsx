import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  EquipmentStatusRecord,
} from "../types";

import {
  equipmentStatusRepository,
} from "../repository/EquipmentStatusRepository";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { RepositoryError } from "@/core/persistence";

export type EquipmentStatusLoadState="idle"|"loading"|"loaded"|"empty"|"error";

interface EquipmentStatusContextType {
  records: EquipmentStatusRecord[];
  loadState:EquipmentStatusLoadState;
  error?:RepositoryError;
  readOnly:boolean;

  create(
    record: EquipmentStatusRecord
  ): void;

  update(
    record: EquipmentStatusRecord
  ): void;

  remove(
    id: string
  ): void;

  restore(
    id: string
  ): void;

  refresh(): void;
  retry():void;
}

const EquipmentStatusContext =
  createContext<
    EquipmentStatusContextType | undefined
  >(undefined);

export function EquipmentStatusProvider({
  children,
}: {
  children: ReactNode;
}) {

  const {repositories:{equipmentStatusRead},configuration}=useApplicationDependenciesCompatibility();
  const readOnly=configuration.equipmentStatusSource==="supabase";
  const [records, setRecords] =
    useState<
      EquipmentStatusRecord[]
    >(() => equipmentStatusRepository.getAll());
  const [loadState,setLoadState]=useState<EquipmentStatusLoadState>("idle");
  const [error,setError]=useState<RepositoryError>();
  const requestSequence=useRef(0);
  const controller=useRef<AbortController|undefined>(undefined);

  const refresh=useCallback(()=>{const sequence=++requestSequence.current;controller.current?.abort();const next=new AbortController();controller.current=next;setLoadState("loading");setError(undefined);void equipmentStatusRead.list({signal:next.signal}).then(result=>{if(next.signal.aborted||sequence!==requestSequence.current)return;if(!result.success){setError(result.error);setLoadState("error");return;}setRecords(result.value.map(record=>structuredClone(record)));setLoadState(result.value.length===0?"empty":"loaded");}).catch(cause=>{if(next.signal.aborted||sequence!==requestSequence.current)return;setError({code:"EQUIPMENT_STATUS_READ_UNEXPECTED",message:"Equipment Status loading failed unexpectedly.",context:{repository:"EquipmentStatus"},recoverability:"RETRYABLE",recommendedAction:"Retry the Equipment Status request.",cause});setLoadState("error");});},[equipmentStatusRead]);

  useEffect(() => {
    refresh();
    return()=>controller.current?.abort();
  }, [refresh]);

  function rejectRemoteWrite(){if(!readOnly)return false;setError({code:"EQUIPMENT_STATUS_REMOTE_READ_ONLY",message:"Remote Equipment Status mode is read-only.",context:{repository:"EquipmentStatus"},recoverability:"USER_ACTION_REQUIRED",recommendedAction:"Switch to local mode to manage Equipment Status records."});setLoadState("error");return true;}

  function create(
    record: EquipmentStatusRecord
  ) {
    if(rejectRemoteWrite())return;
    equipmentStatusRepository.create(
      record
    );

    refresh();
  }

  function update(
    record: EquipmentStatusRecord
  ) {
    if(rejectRemoteWrite())return;
    equipmentStatusRepository.update(
      record
    );

    refresh();
  }

  function remove(
    id: string
  ) {
    if(rejectRemoteWrite())return;
    equipmentStatusRepository.softDelete(
      id
    );

    refresh();
  }

  function restore(
    id: string
  ) {
    if(rejectRemoteWrite())return;
    equipmentStatusRepository.restore(
      id
    );

    refresh();
  }

  return (
    <EquipmentStatusContext.Provider
      value={{
        records,
        loadState,error,readOnly,
        create,
        update,
        remove,
        restore,
        refresh,
        retry:refresh,
      }}
    >
      {children}
    </EquipmentStatusContext.Provider>
  );
}

export function useEquipmentStatuses() {

  const context =
    useContext(
      EquipmentStatusContext
    );

  if (!context) {
    throw new Error(
      "useEquipmentStatuses must be used inside EquipmentStatusProvider."
    );
  }

  return context;
}
