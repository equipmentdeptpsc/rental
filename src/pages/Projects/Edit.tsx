import { useNavigate, useParams } from "react-router-dom";
import ProjectForm from "@/features/project/components/ProjectForm";
import { useProject } from "@/features/project/context/ProjectContext";
import { useCustomer } from "@/features/customer/context/CustomerContext";

export default function EditProject() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { projects, updateProject } = useProject();
  const { customers } = useCustomer();
  const project = projects.find((item) => item.id === id);
  if (!project) return <div className="p-8">Project not found.</div>;
  return <div className="mx-auto max-w-2xl space-y-6 p-8"><h1 className="text-3xl font-bold">Edit Project</h1>{!project.customerId && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-800">Customer assignment required before this legacy Project can be used for a new Rental.</p>}<ProjectForm projectCodeReadOnly initialData={{ projectCode: project.projectCode, projectName: project.projectName, customerId: project.customerId ?? "", location: project.location, projectManager: project.projectManager, status: project.status }} onSubmit={(data) => { const customer = customers.find((item) => item.id === data.customerId); updateProject({ ...project, ...data, client: customer?.companyName ?? project.client }); navigate("/projects"); }} /></div>;
}
