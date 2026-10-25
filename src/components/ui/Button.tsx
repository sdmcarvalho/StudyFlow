import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: "primary" | "secondary" | "danger";
  icon?: ReactNode;
};

export function Button({ variant, icon, className, children, type = "button", ...rest }: ButtonProps) {
  const classes = [styles.btn, styles[variant], className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
