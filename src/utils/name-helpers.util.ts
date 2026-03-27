function sanitizeName(name: string): string {
  if (!name) {
    return '';
  }

  let sanitized = name.trim();
  sanitized = sanitized.replace(/[.,;:!?]+$/, '');
  sanitized = sanitized.trim();
  sanitized = sanitized.replace(/\s+/g, ' ');

  return sanitized;
}

export function sanitizeNames(firstName: string, lastName?: string): { firstName: string; lastName?: string } {
  const sanitizedFirstName = sanitizeName(firstName);
  const sanitizedLastName = lastName ? sanitizeName(lastName) : undefined;

  return {
    firstName: sanitizedFirstName,
    lastName: sanitizedLastName ?? undefined,
  };
}

export function getFullName(firstName: string, lastName?: string): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
}

function extractFirstName(fullName: string): string {
  if (!fullName) {
    return '';
  }
  const parts = fullName.trim().split(/\s+/);
  return parts[0] ?? '';
}

function extractLastName(fullName: string): string {
  if (!fullName) {
    return '';
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return '';
  }
  return parts.slice(1).join(' ');
}

export function extractNameParts(fullName: string): { firstName: string; lastName?: string } {
  const firstName = extractFirstName(fullName);
  const lastName = extractLastName(fullName);
  return {
    firstName,
    lastName: lastName || undefined,
  };
}
