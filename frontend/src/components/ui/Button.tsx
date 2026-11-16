import { type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

// AdminMart .btn-* palette (Bootstrap 4 theme-colors).
const variants = {
  primary:
    "bg-primary border-primary text-white hover:bg-primary-dark hover:border-primary-dark",
  secondary:
    "bg-secondary border-secondary text-white hover:bg-secondary-dark hover:border-secondary-dark",
  success:
    "bg-success border-success text-white hover:bg-success-dark hover:border-success-dark",
  danger:
    "bg-danger border-danger text-white hover:bg-danger-dark hover:border-danger-dark",
  warning:
    "bg-warning border-warning text-heading hover:bg-warning-dark hover:border-warning-dark",
  info: "bg-info border-info text-white hover:bg-primary-dark hover:border-primary-dark",
  cyan: "bg-cyan border-cyan text-white hover:bg-cyan-dark hover:border-cyan-dark",
  dark: "bg-dark border-dark text-white hover:bg-black hover:border-black",
  light:
    "bg-light border-light text-heading hover:bg-light-dark hover:border-light-dark",
  outline:
    "bg-transparent border-primary text-primary hover:bg-primary hover:text-white",
  ghost: "bg-transparent border-transparent text-body hover:text-primary",
} as const;

const sizes = {
  sm: "px-2 py-1 text-sm",
  md: "px-3 py-1.5 text-base",
  lg: "px-4 py-2 text-xl",
} as const;

export type ButtonVariant = keyof typeof variants;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  rounded?: boolean;
  circle?: boolean;
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  rounded,
  circle,
  block,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 border font-normal leading-normal transition-colors duration-150 select-none",
        "disabled:pointer-events-none disabled:opacity-65",
        variants[variant],
        circle ? "size-[42px] rounded-full p-2.5" : sizes[size],
        !circle && (rounded ? "rounded-[2em]" : "rounded-[2px]"),
        block && "w-full",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
