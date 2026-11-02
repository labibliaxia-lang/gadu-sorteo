export type Role = "user" | "admin" | "superadmin";
export type Plan = "organizador" | "premium";
export type RaffleStatus = "active" | "closed" | "drawn";
export type NumberStatus = "available" | "reserved" | "sold";
export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";

export type VerificationStatus = "pending" | "approved" | "rejected";

export type AdminRequestStatus = "none" | "pending" | "approved" | "rejected";

/**
 * Datos públicos del organizador (vista `public_organizers`, migración 0030).
 * Sin email, teléfono ni rutas del KYC: eso ya no se expone a anónimos.
 */
export interface PublicOrganizer {
  id: string;
  /** Slug público (migración 0035). Puede faltar en cuentas viejas. */
  slug: string | null;
  full_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  plan: Plan;
  avatar_url: string | null;
  instagram_url: string | null;
  location: string | null;
  is_verified: boolean;
  email: string | null;
  role_requested: boolean;
  role_request_status: string | null;
  admin_request_status: AdminRequestStatus;
  verification_status: VerificationStatus;
  dni_front_url: string | null;
  face_url: string | null;
  dni_verified: boolean;
  face_verified: boolean;
  request_message: string | null;
  created_at: string;
}

export interface Raffle {
  id: string;
  title: string;
  description: string | null;
  draw_date: string;
  price_per_number: number;
  cover_image_url: string | null;
  payment_type: "mercadopago" | "transferencia";
  transfer_alias: string | null;
  transfer_cbu: string | null;
  transfer_bank: string | null;
  whatsapp_contact: string | null;
  status: RaffleStatus;
  winner_number: number | null;
  winner_user_id: string | null;
  winner_name: string | null;
  drawn_at: string | null;
  /** Huellas SHA-256 publicadas al sortear (migración 0033). */
  numbers_hash: string | null;
  result_hash: string | null;
  hashes_at: string | null;
  /** Compromiso de semilla antes del sorteo y semilla revelada (0034). */
  draw_commitment: string | null;
  draw_commitment_at: string | null;
  draw_seed: string | null;
  draw_seed_revealed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RaffleNumber {
  id: string;
  raffle_id: string;
  number: number;
  status: NumberStatus;
  reserved_by: string | null;
  reserved_until: string | null;
  sold_to: string | null;
  payment_id: string | null;
  sold_at: string | null;
}

export interface Prize {
  id: string;
  raffle_id: string;
  position: number;
  title: string;
  description: string | null;
  image_url: string | null;
  image_url_2: string | null;
  tool_number: number | null;
  created_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  raffle_id: string;
  numbers: number[];
  amount: number;
  status: PaymentStatus;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  created_at: string;
  updated_at: string;
}
