import type {
    FinancialSummary,
  } from "../types";
  
  import FinancialSummaryCard from "../cards/FinancialSummaryCard";
  
  interface Props {
    financial: FinancialSummary;
  }
  
  export default function FinancialSection({
    financial,
  }: Props) {
    return (
      <FinancialSummaryCard
        financial={financial}
      />
    );
  }