import {
    useEffect,
    useState,
  } from "react";
  
  import type {
    ActivityCodeRecord,
  } from "../types";
  
  import {
    MasterFormActions,
  } from "@/components/master-data";
  
  interface Props {
  
    editing?: ActivityCodeRecord | null;
  
    onSave(
      record: ActivityCodeRecord
    ): void;
  
    onCancel(): void;
  
  }
  
  const EMPTY_FORM: ActivityCodeRecord = {
  
    id: "",
  
    activityCode: "",
  
    description: "",
  
    active: true,
  
    deleted: false,
  
  };
  
  export default function ActivityCodeForm({
  
    editing,
  
    onSave,
  
    onCancel,
  
  }: Props) {
  
    const [
  
      form,
  
      setForm,
  
    ] =
    useState<ActivityCodeRecord>(
      EMPTY_FORM
    );
  
    useEffect(() => {
  
      if (editing) {
  
        setForm(editing);
  
      } else {
  
        setForm(EMPTY_FORM);
  
      }
  
    }, [editing]);
  
    function save() {
  
      if (
        !form.activityCode.trim()
      ) {
  
        alert(
          "Activity Code is required."
        );
  
        return;
  
      }
  
      if (
        !form.description.trim()
      ) {
  
        alert(
          "Description is required."
        );
  
        return;
  
      }
  
      onSave({
  
        ...form,
  
        id:
          form.id ||
          crypto.randomUUID(),
  
      });
  
    }
  
    return (
  
      <div className="space-y-5">
  
        <div className="grid gap-4 md:grid-cols-2">
  
          <div>
  
            <label className="text-sm font-medium">
  
              Activity Code
  
            </label>
  
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.activityCode}
              onChange={(e) =>
  
                setForm({
  
                  ...form,
  
                  activityCode:
                    e.target.value,
  
                })
  
              }
            />
  
          </div>
  
          <div>
  
            <label className="text-sm font-medium">
  
              Description
  
            </label>
  
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.description}
              onChange={(e) =>
  
                setForm({
  
                  ...form,
  
                  description:
                    e.target.value,
  
                })
  
              }
            />
  
          </div>
  
        </div>
  
        <label className="flex items-center gap-2">
  
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) =>
  
              setForm({
  
                ...form,
  
                active:
                  e.target.checked,
  
              })
  
            }
          />
  
          Active
  
        </label>
  
        <MasterFormActions
  
          isEditing={
            !!editing
          }
  
          onSave={save}
  
          onCancel={onCancel}
  
        />
  
      </div>
  
    );
  
  }