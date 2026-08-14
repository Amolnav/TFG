
import { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getReport } from '../../services/api';
import type { ReportData } from '../../services/api';
import '../../styles/pages/admin/AdminPages.css';

// N2.4: pestaña Informes — métricas históricas con gráficas SVG propias
// (sin dependencias de gráficos).

function formatDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDay(d);
}

interface BarDatum {
  label: string;
  value: number;
  title?: string;
}

/** Gráfica de barras SVG minimalista y responsive */
function BarChart({ data, height = 160, color = 'var(--accent-action)' }: { data: BarDatum[]; height?: number; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / data.length;
  const labelEvery = Math.max(1, Math.ceil(data.length / 14));

  return (
    <svg
      viewBox={`0 0 100 ${height / 4 + 8}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
      role="img"
    >
      {data.map((d, i) => {
        const h = (d.value / max) * (height / 4);
        return (
          <g key={d.label}>
            <rect
              x={i * barWidth + barWidth * 0.15}
              y={height / 4 - h}
              width={barWidth * 0.7}
              height={h}
              rx={0.6}
              fill={color}
            >
              <title>{d.title ?? `${d.label}: ${d.value}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text
                x={i * barWidth + barWidth * 0.5}
                y={height / 4 + 6}
                textAnchor="middle"
                fontSize={3}
                fill="var(--text-muted)"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function InformesPage() {
  const { t, i18n } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(formatDay(new Date()));
  // BUG-54: carga derivada por clave (sin setState síncrono en efectos)
  const [result, setResult] = useState<{ key: string; report: ReportData | null; failed: boolean } | null>(null);

  const rangeKey = `${from}|${to}`;

  useEffect(() => {
    if (!from || !to) return undefined;
    let cancelled = false;
    getReport(from, to)
      .then((report) => {
        if (!cancelled) setResult({ key: `${from}|${to}`, report, failed: false });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setResult({ key: `${from}|${to}`, report: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const loading = result?.key !== rangeKey;
  const report = !loading && result ? result.report : null;
  const failed = !loading && Boolean(result?.failed);

  const dayData: BarDatum[] = useMemo(
    () =>
      (report?.byDay ?? []).map((d) => ({
        label: d.date.slice(8), // día del mes
        value: d.bookings,
        title: `${d.date}: ${d.bookings} (${d.pax} pax)`,
      })),
    [report]
  );
  const hourData: BarDatum[] = useMemo(
    () =>
      (report?.byHour ?? []).map((h) => ({
        label: `${h.hour}h`,
        value: h.bookings,
      })),
    [report]
  );

  const presets = [
    { key: 'last7', days: 7 },
    { key: 'last30', days: 30 },
    { key: 'last90', days: 90 },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>{t('admin.reports.title')}</h1>
        <p>{t('admin.reports.subtitle')}</p>
      </div>

      <div className="filters-bar" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {presets.map((preset) => (
          <button
            key={preset.key}
            onClick={() => { setFrom(daysAgo(preset.days)); setTo(formatDay(new Date())); }}
            style={{ cursor: 'pointer', padding: '0.4rem 0.9rem', background: 'var(--bg-light)', border: '1px solid var(--border)', borderRadius: '999px', fontSize: '0.8rem', color: 'var(--text-dark)' }}
          >
            {t(`admin.reports.${preset.key}`)}
          </button>
        ))}
        <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          →
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </span>
      </div>

      {loading && <div className="state-loading"><span className="spinner">⏳</span> {t('admin.reports.loading')}</div>}
      {failed && <div className="state-error"><span>⚠️</span>{t('admin.reports.loadError')}</div>}

      {report && (
        <>
          <div className="widgets-grid" style={{ marginBottom: '1.75rem' }}>
            <div className="widget-card accent-primary">
              <div className="widget-card__icon">📅</div>
              <div className="widget-card__label">{t('admin.reports.totalBookings')}</div>
              <div className="widget-card__value">{report.totals.bookings}</div>
              <div className="widget-card__sub">{t('admin.reports.cancelledCount', { n: report.totals.cancelled })}</div>
            </div>
            <div className="widget-card accent-decor">
              <div className="widget-card__icon">👥</div>
              <div className="widget-card__label">{t('admin.reports.totalPax')}</div>
              <div className="widget-card__value">{report.totals.pax}</div>
            </div>
            <div className="widget-card accent-danger">
              <div className="widget-card__icon">👻</div>
              <div className="widget-card__label">{t('admin.reports.noShowRate')}</div>
              <div className="widget-card__value">{report.totals.noShowRate}%</div>
              <div className="widget-card__sub">{t('admin.reports.noShowCount', { n: report.totals.noShows })}</div>
            </div>
            <div className="widget-card accent-primary">
              <div className="widget-card__icon">🆕</div>
              <div className="widget-card__label">{t('admin.reports.customers')}</div>
              <div className="widget-card__value">{report.customers.new + report.customers.returning}</div>
              <div className="widget-card__sub">
                {t('admin.reports.newVsReturning', { new: report.customers.new, returning: report.customers.returning })}
              </div>
            </div>
          </div>

          <div className="section-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>📈 {t('admin.reports.byDayTitle')}</h3>
            {dayData.length > 0
              ? <BarChart data={dayData} />
              : <div className="state-empty">{t('admin.reports.empty')}</div>}
          </div>

          <div className="section-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>⏰ {t('admin.reports.byHourTitle')}</h3>
            {hourData.length > 0
              ? <BarChart data={hourData} color="var(--accent-decor, var(--primary))" />
              : <div className="state-empty">{t('admin.reports.empty')}</div>}
          </div>

          <div className="section-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>🏆 {t('admin.reports.topCustomersTitle')}</h3>
            {report.topCustomers.length === 0 ? (
              <div className="state-empty">{t('admin.reports.empty')}</div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('admin.reports.colCustomer')}</th>
                      <th>{t('admin.reports.colBookings')}</th>
                      <th>{t('admin.reports.colPax')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topCustomers.map((customer) => (
                      <tr key={customer.id}>
                        <td>{customer.name}</td>
                        <td>{customer.bookings}</td>
                        <td>{customer.pax}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
            {t('admin.reports.footnote', {
              from: new Date(`${report.range.from}T00:00:00`).toLocaleDateString(i18n.language),
              to: new Date(`${report.range.to}T00:00:00`).toLocaleDateString(i18n.language),
            })}
          </p>
        </>
      )}
    </div>
  );
}
