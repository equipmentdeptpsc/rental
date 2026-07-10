interface Props {
    message: string;
  }
  
  export default function AssignmentWarning({
    message,
  }: Props) {
    if (!message) return null;
  
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
        <div className="font-semibold">
          Assignment Blocked
        </div>
  
        <div className="mt-1 text-sm">
          {message}
        </div>
      </div>
    );
  }