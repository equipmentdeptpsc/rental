export default function RemoteMutationUnavailable({ title, message }: { title: string; message: string }) {
  return <div className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-3xl font-bold">{title}</h1><div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-950" role="status"><h2 className="font-semibold">Changes unavailable</h2><p className="mt-1 text-sm">{message}</p></div></div>;
}
