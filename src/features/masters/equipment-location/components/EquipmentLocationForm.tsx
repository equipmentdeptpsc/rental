import {
    useEffect,
    useState,
  } from "react";
  
  import type {
    EquipmentLocationRecord,
  } from "../types";
  
  interface Props {
  
    editing: EquipmentLocationRecord | null;
  
    onSave(
      record: EquipmentLocationRecord,
    ): void;
  
    onCancel(): void;
  
  }
  
  export default function EquipmentLocationForm({
  
    editing,
  
    onSave,
  
    onCancel,
  
  }: Props) {
  
    const [
  
      location,
  
      setLocation,
  
    ] = useState("");
  
    const [
  
      description,
  
      setDescription,
  
    ] = useState("");
  
    const [
  
      active,
  
      setActive,
  
    ] = useState(true);
  
    useEffect(() => {
  
      if (editing) {
  
        setLocation(editing.location);
  
        setDescription(editing.description);
  
        setActive(editing.active);
  
      } else {
  
        setLocation("");
  
        setDescription("");
  
        setActive(true);
  
      }
  
    }, [editing]);
  
    function submit(
      e: React.FormEvent,
    ) {
  
      e.preventDefault();
  
      onSave({
  
        id:
  
          editing?.id ??
  
          crypto.randomUUID(),
  
        location:
  
          location.trim(),
  
        description:
  
          description.trim(),
  
        active,
  
        deleted:
  
          editing?.deleted ??
  
          false,
  
        deletedAt:
  
          editing?.deletedAt,
  
      });
  
    }
  
    return (
  
      <form
        onSubmit={submit}
        className="space-y-5"
      >
  
        <div>
  
          <label className="mb-1 block text-sm font-medium">
  
            Equipment Location
  
          </label>
  
          <input
  
            value={location}
  
            onChange={(e) =>
  
              setLocation(
                e.target.value,
              )
  
            }
  
            required
  
            className="w-full rounded-lg border px-3 py-2"
  
          />
  
        </div>
  
        <div>
  
          <label className="mb-1 block text-sm font-medium">
  
            Description
  
          </label>
  
          <input
  
            value={description}
  
            onChange={(e) =>
  
              setDescription(
                e.target.value,
              )
  
            }
  
            required
  
            className="w-full rounded-lg border px-3 py-2"
  
          />
  
        </div>
  
        <label className="flex items-center gap-2">
  
          <input
  
            type="checkbox"
  
            checked={active}
  
            onChange={(e) =>
  
              setActive(
                e.target.checked,
              )
  
            }
  
          />
  
          Active
  
        </label>
  
        <div className="flex justify-end gap-2 pt-4">
  
          <button
  
            type="button"
  
            onClick={onCancel}
  
            className="rounded border px-4 py-2"
  
          >
  
            Cancel
  
          </button>
  
          <button
  
            type="submit"
  
            className="rounded bg-blue-600 px-4 py-2 text-white"
  
          >
  
            {editing ? "Update" : "Save"}
  
          </button>
  
        </div>
  
      </form>
  
    );
  
  }