export interface PasswordRequirement {
  key: string;
  label: string;
  passed: boolean;
}

export function getInitials(value: string | null | undefined) {
  const source = value?.trim();

  if (!source) {
    return "CR";
  }

  const parts = source.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CR";
}

export function evaluatePasswordStrength(
  password: string,
  context?: {
    email?: string;
    fullName?: string;
  },
) {
  const emailLocalPart = context?.email?.split("@")[0]?.toLowerCase() ?? "";
  const fullNameTokens =
    context?.fullName
      ?.toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3) ?? [];
  const loweredPassword = password.toLowerCase();

  const requirements: PasswordRequirement[] = [
    {
      key: "length",
      label: "At least 8 characters",
      passed: password.length >= 8,
    },
    {
      key: "lowercase",
      label: "One lowercase letter",
      passed: /[a-z]/.test(password),
    },
    {
      key: "uppercase",
      label: "One uppercase letter",
      passed: /[A-Z]/.test(password),
    },
    {
      key: "number",
      label: "One number",
      passed: /\d/.test(password),
    },
    {
      key: "special",
      label: "One special character",
      passed: /[^A-Za-z0-9]/.test(password),
    },
    {
      key: "email",
      label: "Avoid your email name",
      passed: emailLocalPart.length < 3 || !loweredPassword.includes(emailLocalPart),
    },
    {
      key: "name",
      label: "Avoid your name",
      passed: !fullNameTokens.some((token) => loweredPassword.includes(token)),
    },
  ];

  const passedRequirements = requirements.filter((requirement) => requirement.passed).length;
  const score = Math.round((passedRequirements / requirements.length) * 100);

  const tone =
    score >= 86 ? "strong" :
    score >= 57 ? "good" :
    score >= 29 ? "fair" :
    "weak";

  const label =
    tone === "strong" ? "Strong" :
    tone === "good" ? "Good" :
    tone === "fair" ? "Fair" :
    "Weak";

  return {
    score,
    label,
    tone,
    isValid: requirements.every((requirement) => requirement.passed),
    requirements,
  };
}
