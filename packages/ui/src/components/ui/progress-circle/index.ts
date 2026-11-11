import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

export { default as ProgressCircle } from "./ProgressCircle.vue";

export const progressCircleVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center",
  {
    variants: {
      size: {
        sm: "size-6",
        md: "size-10",
        lg: "size-16",
        xl: "size-24",
      },
      variant: {
        primary: "stroke-primary",
        secondary: "stroke-secondary",
        success: "stroke-success",
        warning: "stroke-warning",
        destructive: "stroke-destructive",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "primary",
    },
  },
);

export type ProgressCircleVariants = VariantProps<
  typeof progressCircleVariants
>;
