import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, className, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} viewBox="0 0 20 20" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const BoldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4h5a3 3 0 0 1 0 6H6V4Z" />
    <path d="M6 10h6a3 3 0 0 1 0 6H6v-6Z" />
  </Icon>
);
export const ItalicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4h6M5 16h6M12 4 8 16" />
  </Icon>
);
export const StrikeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10h14" />
    <path d="M14 5.5C13.3 4.6 12 4 10.3 4 8 4 6.5 5.1 6.5 6.8c0 1 .5 1.7 1.4 2.2" />
    <path d="M6 14.5c.7 1 2.1 1.5 3.9 1.5 2.4 0 3.9-1.1 3.9-2.8 0-.5-.1-.9-.4-1.2" />
  </Icon>
);
export const HeadingIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 4v12M11.5 4v12M3.5 10h8" />
    <path d="M14.5 11.5l1.75 1.75L18 11.5" />
  </Icon>
);
export const RuleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10h14" />
    <path d="M6 5.5h8M6 14.5h8" opacity="0.4" />
  </Icon>
);
export const BulletListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5h9M8 10h9M8 15h9" />
    <circle cx="4" cy="5" r="0.9" />
    <circle cx="4" cy="10" r="0.9" />
    <circle cx="4" cy="15" r="0.9" />
  </Icon>
);
export const NumberedListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5h9M8 10h9M8 15h9" />
    <path d="M3.5 3.5 4.5 3v4M3 13.5c.3-.6.8-.9 1.3-.9.6 0 1 .4 1 .9 0 .9-2.3 1.6-2.3 2.5h2.4" />
  </Icon>
);
export const TaskListIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="3" width="4" height="4" rx="1" />
    <path d="M3.3 13.2l1 1 1.7-2" />
    <rect x="2.5" y="11" width="4" height="4" rx="1" />
    <path d="M9 5h8M9 13h8" />
  </Icon>
);
export const QuoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4v12" />
    <path d="M8 6h9M8 10h9M8 14h6" />
  </Icon>
);
export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1" />
    <path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1" />
  </Icon>
);
export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="14" height="12" rx="1.5" />
    <circle cx="7.5" cy="8" r="1.3" />
    <path d="M3.5 14.5 8 10.5l3 2.5 2-1.5 3.5 3" />
  </Icon>
);
export const CodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 6 3 10l4 4M13 6l4 4-4 4" />
  </Icon>
);
export const FormulaIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 4H5l5 6-5 6h10" />
  </Icon>
);
export const TableIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="14" height="12" rx="1.5" />
    <path d="M3 8h14M3 12h14M8 4v12M12.5 4v12" />
  </Icon>
);
export const SplitViewIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="14" height="12" rx="1.5" />
    <path d="M10 4v12" />
  </Icon>
);
export const PreviewIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
    <circle cx="10" cy="10" r="2.3" />
  </Icon>
);
export const SaveIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 3h9.5L17 6.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M6.5 3v4h6V3M6 17v-5h8v5" />
  </Icon>
);
export const DragHandleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.5" cy="5" r="1" />
    <circle cx="12.5" cy="5" r="1" />
    <circle cx="7.5" cy="10" r="1" />
    <circle cx="12.5" cy="10" r="1" />
    <circle cx="7.5" cy="15" r="1" />
    <circle cx="12.5" cy="15" r="1" />
  </Icon>
);
