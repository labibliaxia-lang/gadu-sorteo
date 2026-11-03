/** Normaliza direcciones para comparar la del perfil con la del DNI. */
export function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,#°ºª]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function composeDeliveryAddress(parts: {
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string {
  return [
    parts.address_line,
    parts.city,
    parts.province,
    parts.postal_code,
    parts.country,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function addressMatches(
  profile: {
    address_line?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
    country?: string | null;
  },
  dniAddress: string | null | undefined,
): boolean {
  const target = normalizeAddress(dniAddress);
  if (!target) return false;

  const withCountry = normalizeAddress(composeDeliveryAddress(profile));
  const withoutCountry = normalizeAddress(
    composeDeliveryAddress({ ...profile, country: "" }),
  );

  return target === withCountry || target === withoutCountry;
}
