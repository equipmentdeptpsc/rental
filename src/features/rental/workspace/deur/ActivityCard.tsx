interface Props {
    remarks: string;
  }
  
  export default function ActivityCard({
    remarks,
  }: Props) {
    return (
      <div className="rounded-lg border bg-white p-6">
  
        <h3 className="mb-4 text-lg font-semibold">
          Latest Activity
        </h3>
  
        <div className="text-slate-700">
  
          {remarks}
  
        </div>
  
      </div>
    );
  }