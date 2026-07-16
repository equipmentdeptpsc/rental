import type { RentalRecord } from "../types";

const RENTAL_NUMBER_PATTERN = /^RENT-(\d+)$/;

export function generateRentalNumber(
  rentals: RentalRecord[]
): string {
  const highestNumber = rentals.reduce(
    (highest, rental) => {
      const match = rental.rentalNumber?.match(
        RENTAL_NUMBER_PATTERN
      );

      return match
        ? Math.max(highest, Number(match[1]))
        : highest;
    },
    0
  );

  return `RENT-${String(highestNumber + 1).padStart(5, "0")}`;
}
