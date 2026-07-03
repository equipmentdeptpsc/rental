import { useNavigate } from "react-router-dom";

import ProjectForm from "@/features/project/components/ProjectForm";
import { useProject } from "@/features/project/context/ProjectContext";

export default function NewProject() {
  const navigate = useNavigate();

  const { addProject } = useProject();

  return (
    <ProjectForm
      onSubmit={(data) => {
        addProject({
          id: crypto.randomUUID(),
          ...data,
        });

        navigate("/projects");
      }}
    />
  );
}