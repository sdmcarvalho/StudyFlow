import type { ReactNode, SVGProps } from "react";

function Icon({ children, className, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} viewBox="0 0 20 20" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M10 4v12M4 10h12" /></Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="8.5" cy="8.5" r="5.5" /><path d="M16.5 16.5 13 13" /></Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M5 5l10 10M15 5 5 15" /></Icon>
);
export const MenuIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 5h14M3 10h14M3 15h14" /></Icon>
);
export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.9 3.3a1.5 1.5 0 0 1 2.1 0l1.7 1.7a1.5 1.5 0 0 1 0 2.1L7 16.8l-4 .9.9-4L12.9 3.3Z" />
    <path d="M11.3 4.9l3.8 3.8" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h12M8 6V4.5A1 1 0 0 1 9 3.5h2a1 1 0 0 1 1 1V6M6 6l.7 10a1 1 0 0 0 1 1h4.6a1 1 0 0 0 1-1L14 6" />
  </Icon>
);
export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10.5 5.5 4h9L17 10.5" />
    <path d="M3 10.5V15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4.5" />
    <path d="M3 10.5h4.2a.5.5 0 0 1 .47.33L8.3 12.5h3.4l.63-1.67a.5.5 0 0 1 .47-.33H17" />
  </Icon>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 5l-5 5 5 5" /></Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 5l5 5-5 5" /></Icon>
);
export const DocumentIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 3h9l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M13 3v3h3" />
  </Icon>
);
export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H9v14H4.5A1.5 1.5 0 0 1 3 15.5v-11Z" />
    <path d="M17 4.5A1.5 1.5 0 0 0 15.5 3H11v14h4.5a1.5 1.5 0 0 0 1.5-1.5v-11Z" />
  </Icon>
);
export const BookmarkCheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2.5h8a1 1 0 0 1 1 1V17l-5-2.5L5 17V3.5a1 1 0 0 1 1-1Z" />
    <path d="M7.5 7.5l1.5 1.5 3-3" />
  </Icon>
);
export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="14" height="13" rx="1.5" />
    <path d="M3 8h14M7 2.5v3M13 2.5v3" />
  </Icon>
);
