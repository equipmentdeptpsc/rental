import { useRental } from "../context/RentalContext";

export function useReturnRental() {

  const {
    returnRental,
  } = useRental();

  function returnEquipment(
    rentalId: string
  ) {

    const result = returnRental(rentalId);

    return {
      ...result,
      message: result.success
        ? "Equipment returned successfully."
        : result.message,
    };

  }

  return {

    returnEquipment,

  };

}
