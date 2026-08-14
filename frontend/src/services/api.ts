
import axios from 'axios';
import type {
  ReservationPayload,
  ReservationConfirmation,
  DashboardData,
  Booking,
  BookingStatus,
  Closure,
  TimeSlot,
  Customer,
  CustomerListResponse,
  MenuCategory,
  MenuItemPayload,
  PublicFrontendConfig,
  Shift,
  SystemConfig,
  Table,
  TablePayload,
  ZonePayload,
  ZoneWithTables,
} from '../types';

import { getToken, clearToken } from '../utils/session';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // BUG-40: sin timeout, un backend colgado dejaba los spinners
  // y botones deshabilitados para siempre
  timeout: 15000,
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// BUG-40: el 401 solo expulsa al login cuando la petición era del área
// privada; un 401 espurio en un endpoint público no debe echar a un
// visitante anónimo hacia /admin/login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl: string = error.config?.url ?? '';
    const isPrivateRequest = requestUrl.startsWith('/backoffice') || requestUrl.startsWith('/auth/me');
    if (error.response?.status === 401 && isPrivateRequest) {
      clearToken();
      if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Public API ───────────────────────────────────────────

/**
 * Get public config (max pax, etc.)
 * GET /api/public/reservations/availability/config
 */
export async function getPublicConfig() {
  const { data } = await api.get('/public/reservations/availability/config');
  return data.data as { maxPax: number; maxDaysAhead?: number };
}

/**
 * N3.1: días con disponibilidad real de un mes (para el calendario del wizard)
 * GET /api/public/reservations/availability/calendar
 */
export async function getAvailableCalendar(
  year: number,
  month: number,
  pax: number,
  zoneId?: number | null
): Promise<string[]> {
  const params: Record<string, number> = { year, month, pax };
  if (zoneId) params.zoneId = zoneId;
  const { data } = await api.get('/public/reservations/availability/calendar', { params });
  return (data.data?.availableDays || []) as string[];
}

/**
 * Get public frontend configurations (like specialties)
 * GET /api/public/config
 */
export async function getPublicFrontendConfig(): Promise<PublicFrontendConfig> {
  const { data } = await api.get('/public/config');
  return data.data as PublicFrontendConfig;
}

/**
 * Get available time slots for a given date and party size
 * POST /api/public/reservations/availability/times
 */
export async function getAvailableTimes(date: string, pax: number, zoneId?: number | null): Promise<TimeSlot[]> {
  const body: Record<string, unknown> = { date, pax };
  if (zoneId) body.zoneId = zoneId; // N3.2: preferencia de zona opcional
  const { data } = await api.post('/public/reservations/availability/times', body);
  const times: string[] = data.data?.times || [];
  return times.map(time => ({ time, available: true }));
}

/**
 * Create a new reservation (public flow)
 * POST /api/public/reservations
 */
export async function createReservation(
  payload: ReservationPayload
): Promise<ReservationConfirmation> {
  const { data } = await api.post('/public/reservations', payload);
  return data.data as ReservationConfirmation;
}

// ─── Auth ────────────────────────────────────────────────

/**
 * Admin login
 * POST /api/auth/login
 */
export async function authLogin(email: string, password: string): Promise<string> {
  const { data } = await api.post('/auth/login', { email, password });
  return data.data.token as string;
}

// ─── Backoffice API ───────────────────────────────────────

/**
 * Get dashboard summary for a given date (defaults to today)
 * GET /api/backoffice/dashboard
 */
export async function getDashboard(date?: string): Promise<DashboardData> {
  const { data } = await api.get('/backoffice/dashboard', { params: date ? { date } : {} });
  return data.data as DashboardData;
}

/**
 * Get list of bookings with optional filters
 * GET /api/backoffice/bookings
 */
export async function getBookings(params?: {
  date?: string;
  status?: BookingStatus;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ bookings: Booking[]; total: number }> {
  const { data } = await api.get('/backoffice/bookings', { params });
  return {
    bookings: data.data?.bookings || [],
    total: data.data?.pagination?.total || 0,
  };
}

/**
 * Create a new backoffice reservation
 * POST /api/backoffice/bookings
 */
export async function createBackofficeBooking(payload: ReservationPayload & { source?: string }): Promise<Booking> {
  const { data } = await api.post('/backoffice/bookings', payload);
  return data.data as Booking;
}

/**
 * Update a booking's status
 * PATCH /api/backoffice/bookings/:id/status
 */
export async function updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
  const { data } = await api.patch(`/backoffice/bookings/${id}/status`, { status });
  return data.data as Booking;
}

/**
 * Get all zones with their tables
 * GET /api/backoffice/zones
 */
export async function getZones(all: boolean = false): Promise<ZoneWithTables[]> {
  const { data } = await api.get('/backoffice/zones', { params: { all } });
  return (data.data?.zones || data.data) as ZoneWithTables[];
}

export async function createZone(payload: ZonePayload): Promise<ZoneWithTables> {
  const { data } = await api.post('/backoffice/zones', payload);
  return data.data;
}

export async function updateZone(id: number, payload: ZonePayload): Promise<ZoneWithTables> {
  const { data } = await api.put(`/backoffice/zones/${id}`, payload);
  return data.data;
}

export async function deleteZone(id: number) {
  const { data } = await api.delete(`/backoffice/zones/${id}`);
  return data.data;
}

export async function createTable(zoneId: number, payload: TablePayload): Promise<Table> {
  const { data } = await api.post(`/backoffice/zones/${zoneId}/tables`, payload);
  return data.data;
}

export async function updateTable(tableId: number, payload: TablePayload): Promise<Table> {
  const { data } = await api.put(`/backoffice/zones/tables/${tableId}`, payload);
  return data.data;
}

export async function deleteTable(tableId: number) {
  const { data } = await api.delete(`/backoffice/zones/tables/${tableId}`);
  return data.data;
}

export async function getShifts(): Promise<Shift[]> {
  const { data } = await api.get('/backoffice/shifts');
  return (data.data?.shifts || []) as Shift[];
}

export async function updateShift(id: number, payload: Partial<Shift>): Promise<Shift> {
  const { data } = await api.patch(`/backoffice/shifts/${id}`, payload);
  return data.data;
}

// M4: CRUD completo de turnos
export async function createShift(payload: Omit<Shift, 'id'>): Promise<Shift> {
  const { data } = await api.post('/backoffice/shifts', payload);
  return data.data;
}

export async function deleteShift(id: number) {
  const { data } = await api.delete(`/backoffice/shifts/${id}`);
  return data.data;
}

// M4: cierres y festivos (el backend ya existía; esta es la UI)
export async function getClosures(): Promise<Closure[]> {
  const { data } = await api.get('/backoffice/closures');
  return (data.data?.closures || []) as Closure[];
}

export async function createClosure(payload: {
  startDate: string;
  endDate?: string | null;
  reason: string;
  isFullDay?: boolean;
  shiftId?: number | null;
  /** N1.3: cancelar y avisar por email a las reservas afectadas por el cierre */
  notifyAffected?: boolean;
}): Promise<Closure> {
  const { data } = await api.post('/backoffice/closures', payload);
  return data.data;
}

export async function deleteClosure(id: string) {
  const { data } = await api.delete(`/backoffice/closures/${id}`);
  return data.data;
}

export async function getSystemConfig(): Promise<SystemConfig> {
  const { data } = await api.get('/backoffice/config');
  return data.data as SystemConfig;
}

export async function updateSystemConfig(payload: Partial<SystemConfig>): Promise<SystemConfig> {
  const { data } = await api.patch('/backoffice/config', payload);
  return data.data;
}

// ─── Customers API ────────────────────────────────────────

/**
 * Get list of customers with optional search and filters
 * GET /api/backoffice/customers
 */
export async function getCustomers(params?: {
  search?: string;
  isVip?: boolean;
  isBlacklisted?: boolean;
  limit?: number;
  page?: number;
}): Promise<CustomerListResponse> {
  const { data } = await api.get('/backoffice/customers', { params });
  return {
    customers: data.data?.customers || [],
    total: data.data?.total || 0,
  };
}

/**
 * Get customer details by ID
 * GET /api/backoffice/customers/:id
 */
export async function getCustomerById(id: string): Promise<Customer> {
  const { data } = await api.get(`/backoffice/customers/${id}`);
  return data.data as Customer;
}

/**
 * Update customer profile
 * PATCH /api/backoffice/customers/:id
 */
export async function updateCustomer(
  id: string,
  payload: {
    preferences?: string;
    tags?: string[];
    allergens?: string[];
    birthday?: string;
  }
): Promise<Customer> {
  const { data } = await api.patch(`/backoffice/customers/${id}`, payload);
  return data.data;
}

/**
 * Add a note to a customer
 * POST /api/backoffice/customers/:id/notes
 */
export async function addCustomerNote(id: string, note: string): Promise<NonNullable<Customer['notes']>[number]> {
  const { data } = await api.post(`/backoffice/customers/${id}/notes`, { note });
  return data.data;
}

/**
 * Toggle customer VIP status
 * POST /api/backoffice/customers/:id/vip
 */
export async function toggleCustomerVip(id: string, isVip: boolean): Promise<Customer> {
  const { data } = await api.post(`/backoffice/customers/${id}/vip`, { isVip });
  return data.data;
}

/**
 * Toggle customer blacklist status
 * POST /api/backoffice/customers/:id/blacklist
 */
export async function toggleCustomerBlacklist(
  id: string,
  blacklist: boolean,
  reason?: string
): Promise<Customer> {
  const { data } = await api.post(`/backoffice/customers/${id}/blacklist`, {
    blacklist,
    reason,
  });
  return data.data;
}

// ─── Menu API ──────────────────────────────────────────

export interface PublicReview {
  id: string;
  name: string;
  quote: string;
  rating: number;
  profile_photo_url?: string;
  relative_time_description?: string;
}

/**
 * Get public menu
 * GET /api/public/menu
 */
export async function getPublicMenu(): Promise<MenuCategory[]> {
  const { data } = await api.get('/public/menu');
  return (data.data?.categories || []) as MenuCategory[];
}

/**
 * Get public Google reviews
 * GET /api/public/reviews
 */
export async function getReviews(): Promise<PublicReview[]> {
  const { data } = await api.get('/public/reviews');
  return (data.data || []) as PublicReview[];
}

/**
 * Get backoffice menu categories with items
 * GET /api/backoffice/menu/categories
 */
export async function getAdminMenu(): Promise<MenuCategory[]> {
  const { data } = await api.get('/backoffice/menu/categories');
  return data.data.categories as MenuCategory[];
}

export async function createMenuCategory(payload: Omit<MenuCategory, 'id' | 'items'>): Promise<MenuCategory> {
  const { data } = await api.post('/backoffice/menu/categories', payload);
  return data.data;
}

export async function updateMenuCategory(id: number, payload: Omit<MenuCategory, 'id' | 'items'>): Promise<MenuCategory> {
  const { data } = await api.put(`/backoffice/menu/categories/${id}`, payload);
  return data.data;
}

export async function deleteMenuCategory(id: number) {
  const { data } = await api.delete(`/backoffice/menu/categories/${id}`);
  return data.data;
}

export async function createMenuItem(payload: MenuItemPayload) {
  const { data } = await api.post('/backoffice/menu/items', payload);
  return data.data;
}

export async function updateMenuItem(id: number, payload: MenuItemPayload) {
  const { data } = await api.put(`/backoffice/menu/items/${id}`, payload);
  return data.data;
}

export async function deleteMenuItem(id: number) {
  const { data } = await api.delete(`/backoffice/menu/items/${id}`);
  return data.data;
}

export async function reorderMenuCategories(ids: (number | string)[]) {
  const { data } = await api.post('/backoffice/menu/categories/reorder', { ids });
  return data.data;
}

// ============ STAFF (N2.1) ============

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

/**
 * GET /api/backoffice/staff (solo ADMIN)
 */
export async function getStaff(): Promise<StaffMember[]> {
  const { data } = await api.get('/backoffice/staff');
  return data.data.staff;
}

/**
 * POST /api/backoffice/staff (solo ADMIN)
 */
export async function createStaff(payload: {
  email: string;
  name: string;
  password: string;
  role?: 'ADMIN' | 'STAFF';
}): Promise<StaffMember> {
  const { data } = await api.post('/backoffice/staff', payload);
  return data.data.staff;
}

/**
 * PATCH /api/backoffice/staff/:id (solo ADMIN)
 */
export async function updateStaff(
  id: string,
  payload: { name?: string; role?: 'ADMIN' | 'STAFF'; isActive?: boolean; password?: string }
): Promise<StaffMember> {
  const { data } = await api.patch(`/backoffice/staff/${id}`, payload);
  return data.data.staff;
}

/**
 * DELETE /api/backoffice/staff/:id (solo ADMIN)
 */
export async function deleteStaff(id: string) {
  const { data } = await api.delete(`/backoffice/staff/${id}`);
  return data;
}

// ============ AUTOGESTIÓN DE RESERVA (N1.1) ============

export interface ManagedBookingData {
  booking: {
    date: string;
    pax: number;
    duration: number;
    status: string;
    table: { name: string; zone: string | null } | null;
  };
  customer: { firstName: string; emailMasked: string; phoneMasked: string };
  canManage: boolean;
}

/**
 * GET /api/public/reservations/manage/:token — datos de la reserva (PII enmascarada)
 */
export async function getManagedBooking(token: string): Promise<ManagedBookingData> {
  const { data } = await api.get(`/public/reservations/manage/${token}`);
  return data.data;
}

/**
 * POST /api/public/reservations/manage/:token/cancel
 */
export async function cancelManagedBooking(token: string) {
  const { data } = await api.post(`/public/reservations/manage/${token}/cancel`);
  return data;
}

/**
 * POST /api/public/reservations/manage/:token/reschedule
 */
export async function rescheduleManagedBooking(
  token: string,
  payload: { date: string; time: string }
): Promise<ManagedBookingData> {
  const { data } = await api.post(`/public/reservations/manage/${token}/reschedule`, payload);
  return data.data;
}

/**
 * N1.2: reconfirmación en un clic (enlace del email de recordatorio)
 * POST /api/public/reservations/reconfirm/:token
 */
export async function reconfirmBooking(token: string): Promise<ManagedBookingData> {
  const { data } = await api.post(`/public/reservations/reconfirm/${token}`);
  return data.data;
}

// ============ LISTA DE ESPERA (N1.4) ============

export interface WaitlistEntry {
  id: string;
  date: string;
  pax: number;
  notes?: string | null;
  isResolved: boolean;
  notifiedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    isVip?: boolean;
  };
}

/**
 * POST /api/public/reservations/waitlist — alta pública en la lista de espera
 */
export async function joinWaitlist(payload: {
  date: string;
  pax: number;
  notes?: string;
  customer: { firstName: string; lastName: string; email: string; phone: string };
}): Promise<{ id: string; alreadyJoined: boolean }> {
  const { data } = await api.post('/public/reservations/waitlist', payload);
  return data.data.waitlist;
}

/**
 * GET /api/backoffice/waitlist
 */
export async function getWaitlist(params?: { date?: string; includeResolved?: boolean }): Promise<WaitlistEntry[]> {
  const { data } = await api.get('/backoffice/waitlist', { params });
  return data.data.waitlist;
}

/**
 * PATCH /api/backoffice/waitlist/:id/resolve
 */
export async function resolveWaitlistEntry(id: string): Promise<WaitlistEntry> {
  const { data } = await api.patch(`/backoffice/waitlist/${id}/resolve`);
  return data.data.waitlist;
}

/**
 * DELETE /api/backoffice/waitlist/:id
 */
export async function deleteWaitlistEntry(id: string) {
  const { data } = await api.delete(`/backoffice/waitlist/${id}`);
  return data;
}

// ============ AUDITORÍA DE RESERVAS (N2.5) ============

export interface BookingEvent {
  id: string;
  bookingId: string;
  type: string;
  actor?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * GET /api/backoffice/bookings/:id/events — timeline de auditoría
 */
export async function getBookingEvents(bookingId: string): Promise<BookingEvent[]> {
  const { data } = await api.get(`/backoffice/bookings/${bookingId}/events`);
  return data.data.events;
}

// ============ INFORMES (N2.4) ============

export interface ReportData {
  range: { from: string; to: string };
  totals: {
    bookings: number;
    pax: number;
    cancelled: number;
    noShows: number;
    completed: number;
    noShowRate: number;
  };
  byDay: { date: string; bookings: number; pax: number }[];
  byHour: { hour: number; bookings: number }[];
  statusBreakdown: Record<string, number>;
  customers: { new: number; returning: number };
  topCustomers: { id: string; name: string; bookings: number; pax: number }[];
}

/**
 * GET /api/backoffice/reports?from&to — métricas históricas
 */
export async function getReport(from: string, to: string): Promise<ReportData> {
  const { data } = await api.get('/backoffice/reports', { params: { from, to } });
  return data.data;
}

// ============ VISTA DE SALA (N2.2) ============

/**
 * POST /api/backoffice/bookings/:id/reassign — mover una reserva de mesa
 */
export async function reassignBookingTable(id: string, tableId: number): Promise<Booking> {
  const { data } = await api.post(`/backoffice/bookings/${id}/reassign`, { tableId });
  return data.data as Booking;
}

/**
 * POST /api/backoffice/bookings/walkin — sentar un walk-in ahora mismo
 */
export async function createWalkIn(payload: { tableId: number; pax: number; name?: string }): Promise<Booking> {
  const { data } = await api.post('/backoffice/bookings/walkin', payload);
  return data.data as Booking;
}

// ============ RGPD (N4.4) ============

/**
 * GET /api/backoffice/customers/:id/export — exportación RGPD (JSON)
 */
export async function exportCustomerData(id: string): Promise<Record<string, unknown>> {
  const { data } = await api.get(`/backoffice/customers/${id}/export`);
  return data.data;
}

/**
 * POST /api/backoffice/customers/:id/anonymize — anonimización (solo ADMIN)
 */
export async function anonymizeCustomer(id: string): Promise<Customer> {
  const { data } = await api.post(`/backoffice/customers/${id}/anonymize`);
  return data.data.customer;
}
