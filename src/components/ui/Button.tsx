import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant="primary"|"secondary"|"outline"|"ghost"|"success"|"danger"|"destructive";
type ButtonSize="sm"|"md"|"lg"|"icon";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>{children?:ReactNode;variant?:ButtonVariant;size?:ButtonSize;loading?:boolean}
const variants:Record<ButtonVariant,string>={primary:"bg-blue-600 text-white hover:bg-blue-700",secondary:"bg-slate-100 text-slate-900 hover:bg-slate-200",outline:"border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",ghost:"text-slate-700 hover:bg-slate-100",success:"bg-emerald-600 text-white hover:bg-emerald-700",danger:"bg-red-600 text-white hover:bg-red-700",destructive:"bg-red-600 text-white hover:bg-red-700"};
const sizes:Record<ButtonSize,string>={sm:"min-h-9 px-3 py-1.5 text-sm",md:"min-h-10 px-4 py-2",lg:"min-h-12 px-5 py-3",icon:"h-10 w-10 p-0"};
const Button=forwardRef<HTMLButtonElement,ButtonProps>(function Button({children,variant="primary",size="lg",loading=false,disabled,className="",type,...props},ref){return <button ref={ref} type={type} disabled={disabled||loading} aria-busy={loading||undefined} className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`} {...props}>{loading&&<span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"/>}{children}</button>});
export default Button;
