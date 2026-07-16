import { useRental } from "../context/RentalContext";

export function useReleaseRental() {

  const {
    transitionRental,
  } = useRental();

  function release(
    rentalId: string
  ) {

    const result = transitionRental(rentalId, "Released");

    return {
      ...result,
      message: result.success
        ? "Equipment released successfully."
        : result.message,
    };
  }

  return {

    release,

  };

}
