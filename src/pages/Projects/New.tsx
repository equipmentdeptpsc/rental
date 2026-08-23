import { useNavigate } from "react-router-dom";

import ProjectForm from "@/features/project/components/ProjectForm";
import { useProject } from "@/features/project/context/ProjectContext";
import { generateProjectCode } from "@/features/project/utils/generateProjectCode";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getProjectRuntimeCapability, REMOTE_PROJECT_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/project/services/projectRuntimeCapability";
import RemoteMutationUnavailable from "@/components/ui/RemoteMutationUnavailable";
import RemoteProjectForm from "@/features/project/components/RemoteProjectForm";
import { useAuth } from "@/features/auth/AuthContext";

export default function NewProject() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const capability = getProjectRuntimeCapability(configuration, Boolean(commandRepositories.canonicalProject));
  if (capability.canonicalMutations && hasPermission("project.manage")) return <RemoteProjectForm />;
  return capability.legacyMutations ? <LocalNewProject /> : <RemoteMutationUnavailable title="New Project" message={REMOTE_PROJECT_MUTATION_UNAVAILABLE_MESSAGE} />;
}

function LocalNewProject() {
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
