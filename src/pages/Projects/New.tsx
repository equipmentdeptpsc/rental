import { useNavigate } from "react-router-dom";

import ProjectForm from "@/features/project/components/ProjectForm";
import { useProject } from "@/features/project/context/ProjectContext";
import { generateProjectCode } from "@/features/project/utils/generateProjectCode";
import { useCustomer } from "@/features/customer/context/CustomerContext";

export default function NewProject() {
  const navigate = useNavigate();

  const { addProject, projects } = useProject();
  const { customers } = useCustomer();

  const projectCode = generateProjectCode(projects);

  return (
    <ProjectForm
      initialData={{ projectCode, projectName: "", customerId: "", location: "", projectManager: "", status: "Planning" }}
      projectCodeReadOnly
      onSubmit={(data) => {
        if (projects.some(project => project.projectCode.toLowerCase() === data.projectCode.toLowerCase())) {
          throw new Error("Project code already exists.");
        }
        const customer = customers.find((item) => item.id === data.customerId);
        addProject({
          id: crypto.randomUUID(),
          ...data,
          client: customer?.companyName ?? "",
        });

        navigate("/projects");
      }}
    />
  );
}
