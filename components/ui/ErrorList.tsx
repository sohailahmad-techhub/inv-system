export function ErrorList({
  title = 'Please fix the following:' ,
  errors
}: {
  title?: string;
  errors: string[];
}) {
  if (errors.length === 0) return null;

  return (
    <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="font-semibold">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((err) => (
          <li key={err}>{err}</li>
        ))}
      </ul>
    </div>
  );
}
