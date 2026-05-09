"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type SelectOption = {
  value: string;
  label: string;
};

export const JOB_TITLE_OPTIONS: SelectOption[] = [
  { value: "CEO", label: "CEO" },
  { value: "Founder", label: "Founder" },
  { value: "Co-founder", label: "Co-founder" },
  { value: "Managing Director", label: "Managing Director" },
  { value: "Director", label: "Director" },
  { value: "VP Sales", label: "VP Sales" },
  { value: "VP Marketing", label: "VP Marketing" },
  { value: "Head of Procurement", label: "Head of Procurement" },
  { value: "Head of Engineering", label: "Head of Engineering" },
  { value: "Head of Operations", label: "Head of Operations" },
  { value: "CTO", label: "CTO" },
  { value: "CFO", label: "CFO" },
  { value: "CMO", label: "CMO" },
  { value: "Product Manager", label: "Product Manager" },
  { value: "HR Manager", label: "HR Manager" },
  { value: "Other", label: "Other" },
];

export const DEPARTMENT_OPTIONS: SelectOption[] = [
  { value: "Engineering", label: "Engineering" },
  { value: "Sales", label: "Sales" },
  { value: "Marketing", label: "Marketing" },
  { value: "Finance", label: "Finance" },
  { value: "Operations", label: "Operations" },
  { value: "Procurement", label: "Procurement" },
  { value: "Support", label: "Support" },
  { value: "Human Resources", label: "Human Resources" },
  { value: "Legal", label: "Legal" },
  { value: "Product", label: "Product" },
  { value: "Other", label: "Other" },
];

export const COUNTRY_OPTIONS: Array<{ code: string; name: string; dialCode: string; flag: string }> = [
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
];

export function countryLabel(country: { flag: string; name: string; dialCode: string }) {
  return `${country.flag} ${country.name} (${country.dialCode})`;
}

export function OtherSelectField({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const optionValues = options.map((item) => item.value);
  const isCustomValue = value.trim().length > 0 && !optionValues.includes(value);
  const selectValue = isCustomValue ? "Other" : value;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid gap-2">
        <NativeSelect value={selectValue} onChange={(event) => onChange(event.target.value === "Other" ? "" : event.target.value)} className="h-10 rounded-xl px-3 text-sm">
          <option value="">Select {label.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        {selectValue === "Other" ? <Input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 text-sm" placeholder={placeholder ?? `Enter ${label.toLowerCase()}`} /> : null}
      </div>
    </Field>
  );
}

export function PhoneNumberField({
  label,
  code,
  number,
  onCodeChange,
  onNumberChange,
}: {
  label: string;
  code: string;
  number: string;
  onCodeChange: (value: string) => void;
  onNumberChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid grid-cols-[170px_minmax(0,1fr)] overflow-hidden rounded-xl border border-input bg-white">
        <NativeSelect value={code} onChange={(event) => onCodeChange(event.target.value)} className="h-10 rounded-none border-0 border-r bg-transparent px-2 text-xs">
          {COUNTRY_OPTIONS.map((country) => (
            <option key={`${country.code}-${country.dialCode}`} value={country.dialCode}>
              {countryLabel(country)}
            </option>
          ))}
        </NativeSelect>
        <Input value={number} onChange={(event) => onNumberChange(event.target.value)} placeholder="Phone number" className="h-10 rounded-none border-0 text-sm shadow-none focus-visible:ring-0" />
      </div>
    </Field>
  );
}

export function TagInputWithSuggestions({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const datalistId = `${label.toLowerCase().replace(/\s+/g, "-")}-suggestions`;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} list={datalistId} className="h-10 text-sm" placeholder="Type tags separated by commas" />
      <datalist id={datalistId}>
        {suggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <FieldDescription>Separate multiple tags with commas.</FieldDescription>
    </Field>
  );
}

export function SuggestionInputField({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const datalistId = `${label.toLowerCase().replace(/\s+/g, "-")}-options`;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} list={datalistId} className="h-10 text-sm" placeholder={placeholder} />
      <datalist id={datalistId}>
        {suggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </Field>
  );
}
