import type {
  ReactNode,
} from "react";

interface Props {

  title: string;

  toolbar: ReactNode;

  form?: ReactNode;

  table: ReactNode;

}

export default function MasterPageLayout({

  title,

  toolbar,

  form,

  table,

}: Props) {

  return (

    <div className="space-y-6">

      <div>

        <h1 className="text-2xl font-bold">

          {title}

        </h1>

      </div>

      {toolbar}

      {form}

      {table}

    </div>

  );

}