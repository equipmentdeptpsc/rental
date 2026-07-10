import {
    useMemo,
    useState,
  } from "react";
  
  import type {
    ActivityCodeRecord,
  } from "../types";
  
  import {
    useActivityCodes,
  } from "../context";
  
  import ActivityCodeForm from "../components/ActivityCodeForm";
  import ActivityCodeTable from "../components/ActivityCodeTable";
  import ActivityCodeToolbar from "../components/ActivityCodeToolbar";
  
  import MasterDrawer from "@/components/master-data/MasterDrawer";
  import MasterPageLayout from "@/components/master-data/MasterPageLayout";
  
  export default function ActivityCodePage() {
  
    const {
  
      records,
  
      create,
  
      update,
  
      softDelete,
  
    } = useActivityCodes();
  
    const [
  
      keyword,
  
      setKeyword,
  
    ] = useState("");
  
    const [
  
      drawerOpen,
  
      setDrawerOpen,
  
    ] = useState(false);
  
    const [
  
      editing,
  
      setEditing,
  
    ] =
      useState<ActivityCodeRecord | null>(
        null
      );
  
    const filtered =
      useMemo(
  
        () =>
  
          records.filter(
  
            item =>
  
              !item.deleted &&
  
              (
  
                item.activityCode
                  .toLowerCase()
                  .includes(
                    keyword.toLowerCase()
                  )
  
                ||
  
                item.description
                  .toLowerCase()
                  .includes(
                    keyword.toLowerCase()
                  )
  
              )
  
          ),
  
        [
  
          records,
  
          keyword,
  
        ]
  
      );
  
    function openCreate() {
  
      setEditing(null);
  
      setDrawerOpen(true);
  
    }
  
    function openEdit(
  
      record: ActivityCodeRecord
  
    ) {
  
      setEditing(record);
  
      setDrawerOpen(true);
  
    }
  
    function closeDrawer() {
  
      setEditing(null);
  
      setDrawerOpen(false);
  
    }
  
    function save(
  
      record: ActivityCodeRecord
  
    ) {
  
      if (editing) {
  
        update(record);
  
      } else {
  
        create(record);
  
      }
  
      closeDrawer();
  
    }
  
    return (
  
      <>
  
        <MasterPageLayout
  
          title="Activity Code Master"
  
          toolbar={
  
            <ActivityCodeToolbar
  
              keyword={keyword}
  
              onKeywordChange={
                setKeyword
              }
  
              onCreate={
                openCreate
              }
  
            />
  
          }
  
          form={undefined}
  
          table={
  
            <ActivityCodeTable
  
              records={filtered}
  
              onEdit={
                openEdit
              }
  
              onDelete={
                softDelete
              }
  
            />
  
          }
  
        />
  
        <MasterDrawer
  
          open={drawerOpen}
  
          title={
  
            editing
  
              ? "Edit Activity Code"
  
              : "New Activity Code"
  
          }
  
          onClose={
            closeDrawer
          }
  
        >
  
          <ActivityCodeForm
  
            editing={editing}
  
            onSave={save}
  
            onCancel={
              closeDrawer
            }
  
          />
  
        </MasterDrawer>
  
      </>
  
    );
  
  }