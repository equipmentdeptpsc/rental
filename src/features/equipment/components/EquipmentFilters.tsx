import Input from "@/components/ui/Input";

interface Props {
  keyword: string;

  onKeywordChange(
    value: string
  ): void;
}

export default function EquipmentFilters({
  keyword,
  onKeywordChange,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-4">

      <Input
        label="Search Equipment"
        placeholder="Asset number or equipment name..."
        value={keyword}
        onChange={(e) =>
          onKeywordChange(
            e.target.value
          )
        }
      />

    </div>
  );
}