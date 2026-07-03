import { useProject } from "../context/ProjectContext";

export default function ProjectStats() {
  const { projects } =
    useProject();

  const active =
    projects.filter(
      (p) => p.status === "Active"
    ).length;

  const planning =
    projects.filter(
      (p) => p.status === "Planning"
    ).length;

  const completed =
    projects.filter(
      (p) => p.status === "Completed"
    ).length;

  const cards = [
    {
      title: "Projects",
      value: projects.length,
    },
    {
      title: "Active",
      value: active,
    },
    {
      title: "Planning",
      value: planning,
    },
    {
      title: "Completed",
      value: completed,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">

      {cards.map((card) => (

        <div
          key={card.title}
          className="rounded-xl border bg-white p-5"
        >

          <p className="text-sm text-slate-500">
            {card.title}
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            {card.value}
          </h2>

        </div>

      ))}

    </div>
  );
}