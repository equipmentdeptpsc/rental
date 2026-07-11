import {
  useMemo,
  useState,
} from "react";

import {
  MasterDrawer,
  MasterPageLayout,
} from "@/components/master-data";

import MasterImportWizard
  from "@/components/master-data/import-wizard/MasterImportWizard";

import ActivityCodeToolbar
  from "../components/ActivityCodeToolbar";

import ActivityCodeTable
  from "../components/ActivityCodeTable";

import ActivityCodeForm
  from "../components/ActivityCodeForm";

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

import activityImportConfig
  from "../import/activityImportConfig";

  import validateActivityCode
  from "../import/validateActivityCode";

import {
  bulkCreateActivityCodes,
} from "../import/bulkCreateActivityCodes";

export default function ActivityCodePage() {

  const {

    records,

    create,

    update,

    softDelete,

    refresh,

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

    importOpen,

    setImportOpen,

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

    record:
      ActivityCodeRecord

  ) {

    setEditing(record);

    setDrawerOpen(true);

  }

  function save(

    record:
      ActivityCodeRecord

  ) {

    if (editing) {

      update(record);

    }

    else {

      create(record);

    }

    setDrawerOpen(false);

  }

  function handleImport(

    imported:
      any[]

  ) {

    bulkCreateActivityCodes(

      imported

    );

  }

  function handleImportCompleted() {

    refresh();

    setImportOpen(false);

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

          required: false,

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

      <MasterImportWizard

        open={importOpen}

        title="Import Activity Codes"

        columns={

          activityImportConfig.columns.map(

            column => ({

              field:

                column.key as never,

              header:

                column.label,

              required:

                column.required,

            })

          )

        }

        validateRecord={

          (

            record,

            rowNumber,

          ) => {

            const result =

  validateActivityCode(

    [record]

  );

            return result.errors

            .filter(
              (
                error: {
                  row: number;
                  message: string;
                }
              ) =>
            
                error.row === rowNumber
            )

            .map(
              (
                error: {
                  row: number;
                  message: string;
                }
              ) =>
            
                error.message
            );

          }

        }

        onImport={

          handleImport

        }

        onCompleted={() => {

          handleImportCompleted();

        }}

        onClose={() =>

          setImportOpen(false)

        }

      />

    </>

  );

}