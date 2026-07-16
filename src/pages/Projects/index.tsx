import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import ProjectStats from "@/features/project/components/ProjectStats";
import { useProject } from "@/features/project/context/ProjectContext";

export default function ProjectPage() {
  const { projects } = useProject();

  return (
    <div className="space-y-8 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Projects
          </h1>

          <p className="text-slate-500">
            Project Master
          </p>

        </div>

        <Link to="/projects/new">
          <Button>
            New Project
          </Button>
        </Link>

      </div>

      <ProjectStats />

      <ResponsiveTable><div className="rounded-xl border bg-white min-w-max">

        <table className="min-w-full">

          <thead className="bg-slate-100">

            <tr>

              <th className="p-3 text-left">
                Code
              </th>

              <th className="p-3 text-left">
                Project
              </th>

              <th className="p-3 text-left">
                Client
              </th>

              <th className="p-3 text-left">
                Manager
              </th>

              <th className="p-3 text-left">
                Status
              </th>

            </tr>

          </thead>

          <tbody>

            {projects.map((project) => (

              <tr
                key={project.id}
                className="border-t"
              >

                <td className="p-3">
                  {project.projectCode}
                </td>

                <td className="p-3">
                  {project.projectName}
                </td>

                <td className="p-3">
                  {project.client}
                </td>

                <td className="p-3">
                  {project.projectManager}
                </td>

                <td className="p-3">
                  {project.status}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div></ResponsiveTable>

    </div>
  );
}
