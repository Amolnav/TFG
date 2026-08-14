
export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type BookingSource = 'WEB' | 'PHONE' | 'WALK_IN' | 'BACKOFFICE';

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isVip: boolean;
  isBlacklisted: boolean;
  blacklistReason?: string;
  allergens: string[];
  tags: string[];
  preferences?: string;
  birthday?: string;
  previousEmails?: string[];
  previousPhones?: string[];
  previousNames?: string[];
  /** M5: código de idioma en minúsculas ("es", "en", ...), sin lista cerrada */
  language: string;
  totalVisits: number;
  totalNoShows: number;
  createdAt: string;
  updatedAt: string;
  notes?: Array<{
    id: string;
    note: string;
    createdBy: string;
    createdAt: string;
  }>;
  bookings?: Booking[];
  waitlist?: Array<{
    id: string;
    date: string;
    pax: number;
    notes?: string;
    isResolved: boolean;
  }>;
  stats?: {
    totalBookings: number;
    completed: number;
    cancelled: number;
    noShows: number;
    upcoming: number;
    loyaltyRate: number;
    avgDaysBetweenVisits: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

export interface ZoneWithTables extends Zone {
  displayOrder?: number;
  tables: Array<{
    id: number;
    name: string;
    minCapacity: number;
    maxCapacity: number;
    isActive: boolean;
  }>;
}

export interface Shift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  slotInterval: number;
  daysOfWeek: number[];
  isActive: boolean;
  /** M4: límite de reservas que pueden empezar en el mismo slot (null = sin límite) */
  maxBookingsPerSlot?: number | null;
}

export interface Closure {
  id: string;
  startDate: string;
  endDate?: string | null;
  reason: string;
  isFullDay: boolean;
  shiftId?: number | null;
  shift?: Shift | null;
  createdBy: string;
}

/**
 * M5: texto multiidioma con idiomas ABIERTOS ({ es: '...', en: '...' }).
 * Añadir un idioma nuevo no exige tocar este tipo.
 */
export type LocalizedText = Record<string, string>;

export interface SpecialtiesItem {
  id: number;
  name: LocalizedText;
  description: LocalizedText;
  image: string;
}

export interface SpecialtiesConfig {
  title: LocalizedText;
  items: SpecialtiesItem[];
}

export interface HeroConfig {
  title: LocalizedText;
  subtitle?: LocalizedText;
  image?: string;
}

export interface AboutConfig {
  title: LocalizedText;
  text: LocalizedText;
  image?: string;
}

export interface HistorySection {
  title: LocalizedText;
  paragraphs: LocalizedText[];
}

export interface HistoryValue {
  title: LocalizedText;
  text: LocalizedText;
}

export interface HistoryConfig {
  title: LocalizedText;
  subtitle?: LocalizedText;
  valuesTitle?: LocalizedText;
  sections?: HistorySection[];
  values?: HistoryValue[];
  visit?: { title: LocalizedText; text: LocalizedText };
}

export interface ReservationContentConfig {
  quote?: LocalizedText;
  image?: string;
}

export interface MenuNotesConfig {
  title?: LocalizedText;
  text?: LocalizedText;
}

/** M1: horario público derivado de los turnos reales vía API */
export interface PublicScheduleShift {
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
}

export interface PublicSchedule {
  openingDays: number[];
  shifts: PublicScheduleShift[];
}

/** N3.2: zona activa expuesta en la config pública para el wizard */
export interface PublicZone {
  id: number;
  name: string;
  description?: string | null;
}

export interface PublicFrontendConfig {
  restaurant_name: string;
  restaurant_tagline: string;
  restaurant_address: string;
  restaurant_phone: string;
  restaurant_email: string;
  social_instagram: string;
  social_facebook: string;
  maps_url: string;
  map_image: string;
  timezone: string;
  currency: string;
  languages_supported: string;
  language_default: string;
  brand_logo: string;
  theme_primary: string;
  theme_primary_light: string;
  theme_accent: string;
  theme_accent_hover: string;
  theme_decor: string;
  font_heading: string;
  font_body: string;
  fonts_url: string;
  // N4.1: captcha Turnstile activable por configuración
  captcha_enabled: string;
  captcha_site_key: string;
  // N3.2: selector de zona opcional en el wizard
  zone_selection_enabled: string;
  zones: PublicZone[];
  // N1.4: lista de espera cuando un día está completo
  waitlist_enabled: string;
  specialties: SpecialtiesConfig;
  hero: HeroConfig;
  about: AboutConfig;
  history: HistoryConfig;
  reservation: ReservationContentConfig;
  menuNotes: MenuNotesConfig;
  schedule: PublicSchedule;
}

export interface SystemConfig extends Partial<Record<string, string>> {
  dynamic_max_capacity?: string;
  dynamic_max_pax?: string;
  dynamic_active_tables?: string;
  restaurant_name?: string;
  restaurant_tagline?: string;
  restaurant_address?: string;
  restaurant_phone?: string;
  restaurant_email?: string;
  specialties_config?: string;
}

export interface ZonePayload {
  name: string;
  description: string;
  isActive: boolean;
  displayOrder: number;
}

export interface TablePayload {
  name: string;
  minCapacity: number;
  maxCapacity: number;
  isActive: boolean;
}

export interface MenuItemPayload {
  name: string;
  description: string;
  price: string;
  isActive: boolean;
  displayOrder: number;
  categoryId?: number | null;
  /** N3.3 */
  allergens?: string[];
  photoUrl?: string | null;
}

export interface CustomerListResponse {
  customers: Customer[];
  total: number;
}

export interface Zone {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Table {
  id: number;
  name: string;
  minCapacity: number;
  maxCapacity: number;
  isActive: boolean;
  zone: Zone;
}

export interface Booking {
  id: string;
  date: string;
  duration: number;
  pax: number;
  status: BookingStatus;
  source: BookingSource;
  specialRequests?: string;
  customer: Customer;
  table?: Table;
  createdAt: string;
  confirmedAt?: string;
}

export interface DashboardSummary {
  totalBookings: number;
  activeBookings: number;
  totalPaxExpected: number;
  totalTables: number;
  occupancyRate: number;
  upcomingNext7Days: number;
}

export interface DashboardData {
  date: string;
  summary: DashboardSummary;
  statusCounts: Partial<Record<BookingStatus, number>>;
  bookings: Booking[];
}

export interface TimeSlot {
  time: string;
  available: boolean;
  availableTables?: number;
}

export interface ReservationPayload {
  date: string;
  time: string;
  pax: number;
  zoneId?: number;
  specialRequests?: string;
  /** N4.1: token de Cloudflare Turnstile cuando el captcha está activado */
  captchaToken?: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    allergens?: string[];
    /** M5: idioma con el que el cliente hizo la reserva ("es", "en", ...) */
    language?: string;
  };
}

export interface ReservationConfirmation {
  booking: {
    id: string;
    confirmationCode?: string;
    date: string;
    pax: number;
    duration: string;
    status: BookingStatus;
    /** N1.1: token para autogestionar la reserva en /reserva/:token */
    manageToken?: string;
  };
  customer: {
    name: string;
    email: string;
    isReturningCustomer: boolean;
  };
  table: {
    name: string;
    zone?: string;
    note?: string;
  };
}

export interface NewReservationEventPayload {
  id: string;
  date: string;
  pax: number;
  status: BookingStatus;
  tableName: string | null;
  zoneName: string | null;
  customerName: string;
  customerEmail: string;
}

export interface MenuItem {
  id: number;
  name: string;
  description?: string;
  price: string;
  isActive: boolean;
  displayOrder: number;
  /** N3.3: claves de los 14 alérgenos UE (constants/allergens.ts) */
  allergens?: string[];
  /** N3.3: foto del plato (URL http(s) o ruta local /branding/...) */
  photoUrl?: string | null;
}

export interface MenuCategory {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
  items: MenuItem[];
}
