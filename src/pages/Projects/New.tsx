import { useNavigate } from "react-router-dom";

import ProjectForm from "@/features/project/components/ProjectForm";
import { useProject } from "@/features/project/context/ProjectContext";
import { generateProjectCode } from "@/features/project/utils/generateProjectCode";

export default function NewProject() {
  const navigate = useNavigate();

  const { addProject, projects } = useProject();

  const projectCode = generateProjectCode(projects);

  return (
    <ProjectForm
      initialData={{ projectCode, projectName: "", client: "", location: "", projectManager: "", status: "Planning" }}
      projectCodeReadOnly
      onSubmit={(data) => {
        if (projects.some(project => project.projectCode.toLowerCase() === data.projectCode.toLowerCase())) {
          alert("Project code already exists.");
          return;
        }
        addProject({
          id: crypto.randomUUID(),
          ...data,
        });

        navigate("/projects");
      }}
    />
  );
}
