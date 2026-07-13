import Button from "@/components/ui/Button";

interface Props {

  disabled?: boolean;

  onClose(): void;

}

export default function CloseRentalButton({

  disabled,

  onClose,

}: Props) {

  return (

    <Button
      type="button"
      disabled={disabled}
      onClick={onClose}
    >

      Close Rental

    </Button>

  );

}