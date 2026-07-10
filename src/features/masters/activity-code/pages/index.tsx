import {
  useMemo,
  useState,
} from "react";

import {
  MasterDrawer,
  MasterImportDialog,
  MasterPageLayout,
} from "@/components/master-data";

import ActivityCodeToolbar from "../components/ActivityCodeToolbar";
import ActivityCodeTable from "../components/ActivityCodeTable";
import ActivityCodeForm from "../components/ActivityCodeForm";

import {
  useActivityCodes,
} from "../context";

import type {
  ActivityCodeRecord,
} from "../types";

import {
  exportToExcel,
} from "@/shared/import-export/excelExport";

import {
  exportToCsv,
} from "@/shared/import-export/csvExport";

import {
  generateTemplate,
} from "@/shared/import-export/templateGenerator";

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

  ] = useState<ActivityCodeRecord | null>(null);

  const [

    importOpen,

    setImportOpen,

  ] = useState(false);

  const filtered = useMemo(

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

  function save(

    record: ActivityCodeRecord

  ) {

    if (editing) {

      update(record);

    }

    else {

      create(record);

    }

    setDrawerOpen(false);

  }

  function exportExcel() {

    exportToExcel(

      filtered,

      {

        fileName:

          "Activity Codes",

        sheetName:

          "Activity Codes",

        columns: {

          activityCode:

            "Activity Code",

          description:

            "Description",

          active:

            "Active",

        },

      }

    );

  }

  function exportCsv() {

    exportToCsv(

      filtered,

      {

        fileName:

          "Activity Codes",

        columns: {

          activityCode:

            "Activity Code",

          description:

            "Description",

          active:

            "Active",

        },

      }

    );

  }

  function downloadTemplate() {

    generateTemplate(

      [

        {

          header:

            "Activity Code",

          required: true,

          sample:

            "1000",

          description:

            "Unique activity code",

        },

        {

          header:

            "Description",

          required: true,

          sample:

            "PSC Projects",

          description:

            "Activity description",

        },

        {

          header:

            "Active",

          required: true,

          sample: true,

          description:

            "TRUE or FALSE",

        },

      ],

      {

        fileName:

          "Activity Code Template",

      }

    );

  }

  return (

    <>

      <MasterPageLayout

        title="Activity Code Master"

        toolbar={

          <ActivityCodeToolbar

            keyword={keyword}

            onKeywordChange={setKeyword}

            onCreate={openCreate}

            onImport={() =>

              setImportOpen(true)

            }

            onExportExcel={

              exportExcel

            }

            onExportCsv={

              exportCsv

            }

            onDownloadTemplate={

              downloadTemplate

            }

          />

        }

        table={

          <ActivityCodeTable

            records={filtered}

            onEdit={openEdit}

            onDelete={softDelete}

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

        onClose={() =>

          setDrawerOpen(false)

        }

      >

        <ActivityCodeForm

          editing={editing}

          onSave={save}

          onCancel={() =>

            setDrawerOpen(false)

          }

        />

      </MasterDrawer>

      <MasterImportDialog

        open={importOpen}

        title="Import Activity Codes"

        onClose={() =>

          setImportOpen(false)

        }

        /**
         * Batch 1C
         */

        onImport={() => {

          /**
           * Sprint 5.6 Batch 1C
           * Excel parsing and preview
           * will be connected here.
           */
        
          setImportOpen(false);
        
        }}

      />

    </>

  );

}