import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

interface CardSectionProps {
  children: ReactNode;
  className?: string;
}

function Card({
  children,
  className = "",
}: CardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function Header({
  children,
  className = "",
}: CardSectionProps) {
  return (
    <div
      className={`border-b border-slate-200 p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function Body({
  children,
  className = "",
}: CardSectionProps) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}

Card.Header = Header;
Card.Body = Body;

export default Card;