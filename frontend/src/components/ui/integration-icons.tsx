import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type IconProps = ComponentProps<"svg">;

export function GoogleMailIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="4" width="20" height="16" rx="3" fill="#ffffff" />
      <path d="M4 7.2L12 13L20 7.2" stroke="#EA4335" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18V8.2L10.3 12.7" stroke="#34A853" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 18V8.2L13.7 12.7" stroke="#4285F4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 7.2L8.5 4H15.5L20 7.2" stroke="#FBBC05" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WhatsAppIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        fill="#25D366"
        d="M20.5 3.5A11 11 0 0 0 3.23 16.79L2 22l5.35-1.2A11 11 0 1 0 20.5 3.5Zm-8.5 17a9 9 0 0 1-4.6-1.26l-.33-.2-3.18.71.74-3.1-.21-.32A9 9 0 1 1 12 20.5Z"
      />
      <path
        fill="#25D366"
        d="M16.78 13.8c-.26-.13-1.53-.75-1.76-.84-.24-.08-.41-.12-.58.13-.18.25-.67.84-.83 1.01-.15.17-.3.19-.56.06-.26-.13-1.1-.4-2.1-1.28-.78-.7-1.3-1.55-1.45-1.8-.15-.25-.02-.39.11-.52.12-.12.26-.3.38-.44.13-.15.17-.25.26-.42.08-.17.04-.32-.02-.44-.07-.13-.58-1.4-.8-1.92-.2-.5-.41-.43-.57-.44h-.49c-.17 0-.44.06-.67.32-.23.25-.88.86-.88 2.1 0 1.24.9 2.45 1.03 2.62.13.17 1.77 2.7 4.28 3.78.6.26 1.06.41 1.43.53.6.19 1.14.16 1.57.1.48-.07 1.53-.62 1.74-1.23.22-.6.22-1.11.15-1.22-.06-.1-.23-.17-.49-.3Z"
      />
      <path
        fill="#ffffff"
        d="M16.78 13.8c-.26-.13-1.53-.75-1.76-.84-.24-.08-.41-.12-.58.13-.18.25-.67.84-.83 1.01-.15.17-.3.19-.56.06-.26-.13-1.1-.4-2.1-1.28-.78-.7-1.3-1.55-1.45-1.8-.15-.25-.02-.39.11-.52.12-.12.26-.3.38-.44.13-.15.17-.25.26-.42.08-.17.04-.32-.02-.44-.07-.13-.58-1.4-.8-1.92-.2-.5-.41-.43-.57-.44h-.49c-.17 0-.44.06-.67.32-.23.25-.88.86-.88 2.1 0 1.24.9 2.45 1.03 2.62.13.17 1.77 2.7 4.28 3.78.6.26 1.06.41 1.43.53.6.19 1.14.16 1.57.1.48-.07 1.53-.62 1.74-1.23.22-.6.22-1.11.15-1.22-.06-.1-.23-.17-.49-.3Z"
      />
    </svg>
  );
}

export function LinkedInIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path fill="#fff" d="M6.24 9.4H9V18H6.24zM7.62 5.2A1.6 1.6 0 1 1 6 6.8a1.6 1.6 0 0 1 1.62-1.6ZM10.52 9.4h2.64v1.18h.04c.37-.7 1.27-1.44 2.62-1.44 2.8 0 3.32 1.84 3.32 4.23V18h-2.76v-3.96c0-.94-.02-2.16-1.32-2.16-1.32 0-1.52 1.03-1.52 2.1V18h-2.76V9.4Z" />
    </svg>
  );
}

export function GoogleDriveIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M7.4 3.4h9.2l4.2 7.3h-9.2L7.4 3.4Z" fill="#0F9D58" />
      <path d="M3.2 10.7 7.4 3.4l4.2 7.3-4.2 7.3-4.2-7.3Z" fill="#F4B400" />
      <path d="M7.4 18h9.2l4.2-7.3h-9.2L7.4 18Z" fill="#4285F4" />
    </svg>
  );
}

export function WebhookIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="6" cy="12" r="2.5" fill="#2563EB" />
      <circle cx="18" cy="6" r="2.5" fill="#0EA5E9" />
      <circle cx="18" cy="18" r="2.5" fill="#38BDF8" />
      <path d="M8.4 11.2 15.4 7.1M8.4 12.8l7 4.1" stroke="#1E3A8A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
