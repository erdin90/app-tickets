import { Card } from "@/components/ui/Card";

export function EmptyState({ title, hint, cta }: { title: string; hint: string; cta?: React.ReactNode }) {
  return (
    <Card className="grid place-items-center h-[420px]">
      <div className="text-center max-w-sm">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-neutral-600">{hint}</p>
        {cta ? <div className="mt-4">{cta}</div> : null}
      </div>
    </Card>
  );
}
