import {
    MasterToolbar,
  } from "@/components/master-data";
  
  interface Props {
  
    keyword: string;
  
    onKeywordChange(
      value: string
    ): void;
  
    onCreate(): void;
  
  }
  
  export default function CostCodeToolbar({
  
    keyword,
  
    onKeywordChange,
  
    onCreate,
  
  }: Props) {
  
    return (
  
      <MasterToolbar
  
        keyword={keyword}
  
        onKeywordChange={onKeywordChange}
  
        onCreate={onCreate}
  
        createLabel="Cost Code"
  
      />
  
    );
  
  }