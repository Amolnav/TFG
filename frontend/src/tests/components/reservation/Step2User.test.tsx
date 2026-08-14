import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Step2User from '../../../components/reservation/Step2User';
import * as api from '../../../services/api';
import type { ReservationConfirmation } from '../../../types';

vi.mock('../../../services/api', () => ({
  createReservation: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'es' },
  }),
}));

// N4.1: Step2User lee captcha_enabled/captcha_site_key de la config pública;
// con los defaults neutros el captcha está desactivado.
vi.mock('../../../context/useConfig', async () => {
  const { DEFAULT_PUBLIC_CONFIG } = await import('../../../constants/publicConfig');
  return {
    useConfig: () => ({ config: DEFAULT_PUBLIC_CONFIG, loading: false }),
  };
});

const bookingData = { date: '2026-05-01', time: '14:00', pax: 2 };

const confirmation = {
  booking: { id: 'b1', date: '2026-05-01T12:00:00.000Z', pax: 2, duration: '90 minutos', status: 'CONFIRMED' },
  customer: { name: 'Juan Pérez', email: 'juan@example.com', isReturningCustomer: false },
  table: { name: 'Mesa 1', zone: 'Sala' },
} as unknown as ReservationConfirmation;

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('reservation.firstNameLabel'), { target: { value: 'Juan' } });
  fireEvent.change(screen.getByLabelText('reservation.lastNameLabel'), { target: { value: 'Pérez' } });
  fireEvent.change(screen.getByLabelText('reservation.emailLabel'), { target: { value: 'juan@example.com' } });
  fireEvent.change(screen.getByLabelText('reservation.phoneLabel'), { target: { value: '600123456' } });
}

describe('Step2User (BUG-43)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('un doble clic rápido solo crea UNA reserva', async () => {
    const onNext = vi.fn();
    vi.mocked(api.createReservation).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(confirmation), 50))
    );

    render(<Step2User bookingData={bookingData} onNext={onNext} onBack={() => {}} />);
    fillValidForm();

    const submit = screen.getByText('reservation.confirmBtn');
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(api.createReservation).toHaveBeenCalledTimes(1);
  });

  it('rechaza emails sin formato válido antes de llamar a la API', async () => {
    render(<Step2User bookingData={bookingData} onNext={() => {}} onBack={() => {}} />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText('reservation.emailLabel'), { target: { value: 'a@' } });

    fireEvent.click(screen.getByText('reservation.confirmBtn'));

    expect(await screen.findByText('reservation.errorEmail')).toBeInTheDocument();
    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it('rechaza teléfonos sin dígitos suficientes', async () => {
    render(<Step2User bookingData={bookingData} onNext={() => {}} onBack={() => {}} />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText('reservation.phoneLabel'), { target: { value: 'abc' } });

    fireEvent.click(screen.getByText('reservation.confirmBtn'));

    expect(await screen.findByText('reservation.errorPhone')).toBeInTheDocument();
    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it('filtra alérgenos vacíos ("gluten," no envía cadenas vacías)', async () => {
    const onNext = vi.fn();
    vi.mocked(api.createReservation).mockResolvedValue(confirmation);

    render(<Step2User bookingData={bookingData} onNext={onNext} onBack={() => {}} />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText('reservation.allergiesLabel'), { target: { value: 'gluten, ' } });

    fireEvent.click(screen.getByText('reservation.confirmBtn'));
    await waitFor(() => expect(onNext).toHaveBeenCalled());

    const payload = vi.mocked(api.createReservation).mock.calls[0][0];
    expect(payload.customer.allergens).toEqual(['gluten']);
  });
});
