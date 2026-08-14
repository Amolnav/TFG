import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import Step1DateTime from '../../../components/reservation/Step1DateTime';
import * as api from '../../../services/api';
import type { TimeSlot } from '../../../types';

// N1.4: Step1 usa useSearchParams (prefill desde el email de lista de espera)
function render(ui: ReactElement, initialPath = '/reservar') {
  return rtlRender(<MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>);
}

const t = (key: string) => {
  const keys: Record<string, string> = {
    'reservation.step1Title': 'Haz tu Reserva',
    'reservation.dateLabel': 'Fecha',
    'reservation.timeLabel': 'Hora',
    'reservation.paxLabel': 'Comensales',
    'reservation.nextBtn': 'Siguiente →',
    'reservation.loadingSlots': 'Cargando horarios...',
    'reservation.errorNoSlots': 'No hay horarios disponibles para este día y número de comensales. Prueba con otra fecha.',
  };
  return keys[key] || key;
};

// Mock de los servicios de API
vi.mock('../../../services/api', () => ({
  getAvailableTimes: vi.fn(),
  getPublicConfig: vi.fn(),
  getAvailableCalendar: vi.fn(),
  joinWaitlist: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t,
    i18n: { language: 'es' },
  }),
}));

// N3.2: Step1 lee zone_selection_enabled/zones de la config pública. El mock
// permite sobreescribir claves por test vía globalThis.__testConfigOverrides.
vi.mock('../../../context/useConfig', async () => {
  const { DEFAULT_PUBLIC_CONFIG } = await import('../../../constants/publicConfig');
  return {
    useConfig: () => ({
      config: {
        ...DEFAULT_PUBLIC_CONFIG,
        ...((globalThis as Record<string, unknown>).__testConfigOverrides as object | undefined),
      },
      loading: false,
    }),
  };
});

// N3.1: el calendario arranca en el mes actual, así que las fechas del test
// se calculan relativas a hoy para que la suite no caduque.
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
const NOW = new Date();
const OPEN_DAY = `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}-${pad(NOW.getDate())}`;
const CLOSED_DAY_NUM = NOW.getDate() === 1 ? 2 : 1;
const CLOSED_DAY = `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}-${pad(CLOSED_DAY_NUM)}`;

describe('Step1DateTime Component (con calendario N3.1)', () => {
  const onNext = vi.fn();
  const mockedGetPublicConfig = vi.mocked(api.getPublicConfig);
  const mockedGetAvailableTimes = vi.mocked(api.getAvailableTimes);
  const mockedGetAvailableCalendar = vi.mocked(api.getAvailableCalendar);

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as Record<string, unknown>).__testConfigOverrides = undefined;
    mockedGetPublicConfig.mockResolvedValue({ maxPax: 12, maxDaysAhead: 30 });
    mockedGetAvailableTimes.mockResolvedValue([] as TimeSlot[]);
    mockedGetAvailableCalendar.mockResolvedValue([OPEN_DAY]);
  });

  function dayButton(container: HTMLElement, date: string): HTMLButtonElement | null {
    return container.querySelector(`[data-date="${date}"]`);
  }

  it('renderiza el calendario y pide la disponibilidad del mes actual', async () => {
    const { container } = render(<Step1DateTime onNext={onNext} />);
    expect(screen.getByText('Haz tu Reserva')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedGetAvailableCalendar).toHaveBeenCalledWith(
        NOW.getFullYear(),
        NOW.getMonth() + 1,
        2,
        null
      );
    });
    await waitFor(() => {
      expect(dayButton(container, OPEN_DAY)).not.toBeDisabled();
    });
  });

  it('los días sin disponibilidad están deshabilitados', async () => {
    const { container } = render(<Step1DateTime onNext={onNext} />);
    await waitFor(() => {
      expect(dayButton(container, OPEN_DAY)).not.toBeDisabled();
    });
    expect(dayButton(container, CLOSED_DAY)).toBeDisabled();
  });

  it('seleccionar un día disponible carga sus horarios', async () => {
    const mockSlots = [
      { time: '13:00', available: true },
      { time: '13:30', available: true },
      { time: '14:00', available: false },
    ];
    mockedGetAvailableTimes.mockResolvedValue(mockSlots);

    const { container } = render(<Step1DateTime onNext={onNext} />);
    await waitFor(() => expect(dayButton(container, OPEN_DAY)).not.toBeDisabled());

    fireEvent.click(dayButton(container, OPEN_DAY)!);

    await waitFor(() => {
      expect(mockedGetAvailableTimes).toHaveBeenCalledWith(OPEN_DAY, 2, null);
      expect(screen.getByText('13:00')).toBeInTheDocument();
      expect(screen.getByText('13:30')).toBeInTheDocument();
      expect(screen.queryByText('14:00')).not.toBeInTheDocument(); // No disponible
    });
  });

  it('cambiar los comensales recarga horarios y disponibilidad del mes', async () => {
    const { container } = render(<Step1DateTime onNext={onNext} />);
    await waitFor(() => expect(dayButton(container, OPEN_DAY)).not.toBeDisabled());

    fireEvent.click(dayButton(container, OPEN_DAY)!);

    const paxSelect = screen.getByLabelText('Comensales');
    fireEvent.change(paxSelect, { target: { value: '4' } });

    await waitFor(() => {
      expect(mockedGetAvailableTimes).toHaveBeenCalledWith(OPEN_DAY, 4, null);
      expect(mockedGetAvailableCalendar).toHaveBeenCalledWith(
        NOW.getFullYear(),
        NOW.getMonth() + 1,
        4,
        null
      );
    });
  });

  it('sin configuración de zonas no muestra el selector (default neutro)', async () => {
    render(<Step1DateTime onNext={onNext} />);
    expect(screen.queryByLabelText('reservation.zoneLabel')).not.toBeInTheDocument();
  });

  it('con zonas activadas muestra el selector y propaga la zona elegida (N3.2)', async () => {
    (globalThis as Record<string, unknown>).__testConfigOverrides = {
      zone_selection_enabled: 'true',
      zones: [
        { id: 1, name: 'Terraza' },
        { id: 2, name: 'Interior' },
      ],
    };

    const { container } = render(<Step1DateTime onNext={onNext} />);
    await waitFor(() => expect(dayButton(container, OPEN_DAY)).not.toBeDisabled());

    fireEvent.click(dayButton(container, OPEN_DAY)!);

    const zoneSelect = screen.getByLabelText('reservation.zoneLabel');
    fireEvent.change(zoneSelect, { target: { value: '2' } });

    await waitFor(() => {
      expect(mockedGetAvailableTimes).toHaveBeenCalledWith(OPEN_DAY, 2, 2);
      expect(mockedGetAvailableCalendar).toHaveBeenCalledWith(
        NOW.getFullYear(),
        NOW.getMonth() + 1,
        2,
        2
      );
    });
  });

  it('llama a onNext con fecha, hora y pax al enviar', async () => {
    mockedGetAvailableTimes.mockResolvedValue([{ time: '13:00', available: true }]);

    const { container } = render(<Step1DateTime onNext={onNext} />);
    await waitFor(() => expect(dayButton(container, OPEN_DAY)).not.toBeDisabled());

    fireEvent.click(dayButton(container, OPEN_DAY)!);
    await waitFor(() => screen.getByText('13:00'));
    fireEvent.click(screen.getByText('13:00'));

    fireEvent.click(screen.getByText('Siguiente →'));

    expect(onNext).toHaveBeenCalledWith({
      date: OPEN_DAY,
      time: '13:00',
      pax: 2,
    });
  });
});
