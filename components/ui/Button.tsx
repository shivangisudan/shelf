import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-gradient-warm text-accent-fg font-semibold",
  secondary: "border border-strong bg-transparent text-primary",
  ghost: "border-0 bg-transparent text-secondary",
};

export default function Button({
  children,
  className = "",
  disabled,
  fullWidth = false,
  loading = false,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={`relative inline-flex min-h-[52px] items-center justify-center rounded-md px-6 text-base leading-none transition-opacity disabled:pointer-events-none disabled:opacity-40 ${variantClasses[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      <span className={loading ? "invisible" : ""}>{children}</span>
      {loading ? (
        <span
          className="absolute size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-label="Loading"
        />
      ) : null}
    </button>
  );
}