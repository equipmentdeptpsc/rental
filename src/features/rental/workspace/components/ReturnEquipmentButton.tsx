import Button from "@/components/ui/Button";

interface Props {

  disabled?: boolean;

  onReturn(): void;

}

export default function ReturnEquipmentButton({

  disabled,

  onReturn,

}: Props) {

  return (

    <Button
      type="button"
      disabled={disabled}
      onClick={onReturn}
    >

      Return Equipment

    </Button>

  );

}