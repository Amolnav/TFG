import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import '../styles/pages/ReservationPage.css';
import Step1DateTime from '../components/reservation/Step1DateTime';
import Step2User from '../components/reservation/Step2User';
import Step3Success from '../components/reservation/Step3Success';
import { useConfig } from '../context/useConfig';
import { pickLocalized, formatOpeningDays } from '../utils/i18n';
import type { ReservationConfirmation } from '../types';

type Step = 1 | 2 | 3;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function ReservationPage() {
  const { t, i18n } = useTranslation();
  const { config } = useConfig();

  // M1: horarios y días REALES derivados de los turnos vía API, no textos fijos
  const hoursText = config.schedule.shifts
    .map((shift) => `${shift.name}: ${shift.startTime} – ${shift.endTime}`)
    .join(' · ');
  const dayNames = DAY_KEYS.map((key) => t(`days.${key}`));
  const daysText = formatOpeningDays(config.schedule.openingDays, dayNames, t('days.everyDay'));

  // M2: cita e imagen del panel lateral desde configuración
  const quote = pickLocalized(config.reservation.quote, i18n.language, config.language_default);
  const panelBackground = config.reservation.image
    ? `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url("${config.reservation.image}")`
    : 'linear-gradient(150deg, var(--primary), var(--primary-light))';
  const [step, setStep] = useState<Step>(1);
  const [bookingData, setBookingData] = useState<{ date: string; time: string; pax: number; zoneId?: number } | null>(null);
  const [confirmation, setConfirmation] = useState<ReservationConfirmation | null>(null);

  const handleStep1 = (data: { date: string; time: string; pax: number; zoneId?: number }) => {
    setBookingData(data);
    setStep(2);
  };

  const handleStep2 = (conf: ReservationConfirmation) => {
    setConfirmation(conf);
    setStep(3);
  };

  const handleRestart = () => {
    setStep(1);
    setBookingData(null);
    setConfirmation(null);
  };

  return (
    <div className="reservation-page">
      <Navbar isReservation={true} />

      {/* Main content */}
      <main className="reservation-container">
        <div className="reservation-card">
          {/* Left panel — image */}
          <div className="reservation-image-panel" style={{ backgroundImage: panelBackground, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <div className="image-panel__decor">
              <div className="image-panel__decor-line" />
              <div className="image-panel__decor-line" style={{ width: '24px' }} />
            </div>
            <div>
              {quote && (
                <div className="image-panel__quote">
                  {quote}
                </div>
              )}
              <div className="image-panel__info">
                {config.restaurant_address && <span>📍 {config.restaurant_address}</span>}
                {hoursText && <span>🕐 {hoursText}</span>}
                {daysText && <span>📅 {daysText}</span>}
              </div>
            </div>
          </div>

          {/* Right panel — form */}
          <div className="reservation-form-panel">
            {/* Step indicator */}
            <div className="step-indicator">
              <div className={`step-dot ${step === 1 ? 'active' : 'done'}`}>
                {step > 1 ? '✓' : '1'}
              </div>
              <div className={`step-line ${step > 1 ? 'done' : ''}`} />
              <div className={`step-dot ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
                {step > 2 ? '✓' : '2'}
              </div>
              <div className={`step-line ${step > 2 ? 'done' : ''}`} />
              <div className={`step-dot ${step === 3 ? 'active' : ''}`}>3</div>
            </div>

            {/* Step content */}
            {step === 1 && <Step1DateTime onNext={handleStep1} />}
            {step === 2 && bookingData && (
              <Step2User
                bookingData={bookingData}
                onNext={handleStep2}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && confirmation && bookingData && (
              <Step3Success confirmation={confirmation} bookingData={bookingData} onRestart={handleRestart} />
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="res-footer">
        {t('footer.copyright', { year: new Date().getFullYear(), name: config.restaurant_name })}
      </footer>
    </div>
  );
}
