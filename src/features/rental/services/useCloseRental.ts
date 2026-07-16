import { useRental } from "../context/RentalContext";

export function useCloseRental() {
  const { transitionRental } = useRental();

  function close(rentalId: string) {
    const result = transitionRental(rentalId, "Closed");

    return {
      ...result,
      message: result.success
        ? "Rental closed successfully."
        : result.message,
    };
  }

  return { close };
}
