import Button from "@/components/ui/Button";

interface Props {

  disabled?: boolean;

  onRelease(): void;

}

export default function ReleaseEquipmentButton({

  disabled,

  onRelease,

}: Props) {

  return (

    <Button
      type="button"
      disabled={disabled}
      onClick={onRelease}
    >

      Release Equipment

    </Button>

  );

}