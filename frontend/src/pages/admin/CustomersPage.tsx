
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCustomers } from '../../services/api';
import type { Customer } from '../../types';
import CustomerDetailsModal from '../../components/admin/CustomerDetailsModal';
import '../../styles/pages/admin/CustomersPage.css';

// BUG-48: la API de clientes solo soporta limit; "Mostrar más" lo amplía
const CUSTOMERS_PAGE_SIZE = 100;

export default function CustomersPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdParam = searchParams.get('id');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(CUSTOMERS_PAGE_SIZE);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    isVip: false,
    isBlacklisted: false,
  });

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: {
        limit: number;
        search?: string;
        isVip?: boolean;
        isBlacklisted?: boolean;
      } = { limit };

      if (searchTerm) params.search = searchTerm;
      if (filters.isVip) params.isVip = true;
      if (filters.isBlacklisted) params.isBlacklisted = true;

      // BUG-48: se muestra el total real de la API, no customers.length
      const { customers: fetchedCustomers, total: fetchedTotal } = await getCustomers(params);
      setCustomers(fetchedCustomers || []);
      setTotal(fetchedTotal || 0);
    } catch (err) {
      const errorMessage =
        (err as { response?: { data?: { message: string } } })?.response?.data
          ?.message || t('admin.customers.loadError');
      setError(errorMessage);
      setCustomers([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filters, limit, t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchCustomers();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [fetchCustomers]);

  // Set selected customer from URL param on load
  useEffect(() => {
    if (customerIdParam) {
      setSelectedCustomerId(customerIdParam);
    }
  }, [customerIdParam]);

  const handleFilterChange = (filterKey: 'isVip' | 'isBlacklisted') => {
    setLimit(CUSTOMERS_PAGE_SIZE);
    setFilters((prev) => ({
      ...prev,
      [filterKey]: !prev[filterKey],
    }));
  };

  const getStatusBadges = (customer: Customer) => {
    const badges = [];
    if (customer.isVip) {
      badges.push(
        <span key="vip" className="customer-badge customer-badge--vip" title={t('admin.customers.vipBadge')}>
          ⭐
        </span>
      );
    }
    if (customer.isBlacklisted) {
      badges.push(
        <span key="blacklist" className="customer-badge customer-badge--blacklist" title={t('admin.customers.blacklistBadge')}>
          🚫
        </span>
      );
    }
    if (customer.allergens && customer.allergens.length > 0) {
      badges.push(
        <span key="allergy" className="customer-badge customer-badge--allergy" title={t('admin.customers.allergiesBadge', { list: customer.allergens.join(', ') })}>
          🚨
        </span>
      );
    }
    if (customer.tags && customer.tags.length > 0) {
      const otherTags = customer.tags.filter(
        (tag) => tag !== 'VIP' && tag !== 'BLACKLIST'
      );
      otherTags.slice(0, 2).forEach((tag) => {
        badges.push(
          <span key={tag} className="customer-badge customer-badge--tag" style={{ fontSize: '0.7rem' }}>
            {tag}
          </span>
        );
      });
    }
    return badges;
  };

  const getRowClass = (customer: Customer) => {
    let className = 'customer-row';
    if (customer.isBlacklisted) className += ' customer-row--blacklisted';
    if (customer.isVip) className += ' customer-row--vip';
    return className;
  };

  return (
    <div className="customers-page">
      {/* Header */}
      <div className="customers-header">
        <h1>👥 {t('admin.customers.title')}</h1>
        <p className="customers-subtitle">
          {t('admin.customers.subtitle')}
        </p>
      </div>

      {/* Filters & Search */}
      <div className="customers-controls">
        <div className="customers-search">
          <input
            type="text"
            placeholder={t('admin.customers.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setLimit(CUSTOMERS_PAGE_SIZE); }}
            className="customers-search__input"
          />
        </div>

        <div className="customers-filters">
          <label className="customers-filter">
            <input
              type="checkbox"
              checked={filters.isVip}
              onChange={() => handleFilterChange('isVip')}
            />
            <span>⭐ {t('admin.customers.onlyVip')}</span>
          </label>

          <label className="customers-filter">
            <input
              type="checkbox"
              checked={filters.isBlacklisted}
              onChange={() => handleFilterChange('isBlacklisted')}
            />
            <span>🚫 {t('admin.customers.onlyBlacklist')}</span>
          </label>
        </div>
      </div>

      {/* Content */}
      {error && <div className="customers-error">❌ {error}</div>}

      {isLoading ? (
        <div className="customers-loading">{t('admin.customers.loading')}</div>
      ) : customers.length === 0 ? (
        <div className="customers-empty">{t('admin.customers.empty')}</div>
      ) : (
        <div className="customers-table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                <th>{t('admin.customers.colName')}</th>
                <th>{t('admin.customers.colEmail')}</th>
                <th>{t('admin.customers.colPhone')}</th>
                <th className="text-center">{t('admin.customers.colVisits')}</th>
                <th className="text-center">{t('admin.customers.colNoShows')}</th>
                <th className="text-center">{t('admin.customers.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className={getRowClass(customer)}
                  onClick={() => setSelectedCustomerId(customer.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <strong>
                      {customer.firstName} {customer.lastName}
                    </strong>
                  </td>
                  <td>{customer.email}</td>
                  <td>{customer.phone || '-'}</td>
                  <td className="text-center">{customer.totalVisits}</td>
                  <td className="text-center">{customer.totalNoShows}</td>
                  <td className="text-center">
                    <div className="customer-badges" style={{ justifyContent: 'center' }}>
                      {getStatusBadges(customer)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {!isLoading && customers.length > 0 && (
        <div className="customers-summary" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span>
            {t('admin.customers.showing', { shown: customers.length, total })}
            {filters.isVip && ' (VIP)'}
            {filters.isBlacklisted && ' (Blacklist)'}
          </span>
          {/* BUG-48: si hay más clientes de los mostrados, permitir cargar más */}
          {customers.length < total && (
            <button
              className="btn btn-outline"
              style={{ padding: '0.35rem 0.9rem', fontSize: '0.85rem', cursor: 'pointer' }}
              onClick={() => setLimit((l) => l + CUSTOMERS_PAGE_SIZE)}
            >
              {t('admin.customers.showMore')}
            </button>
          )}
        </div>
      )}

      {/* Reusable Details Modal */}
      {selectedCustomerId && (
        <CustomerDetailsModal
          customerId={selectedCustomerId}
          onClose={() => {
            setSelectedCustomerId(null);
            if (searchParams.has('id')) {
              setSearchParams({});
            }
          }}
          onUpdate={fetchCustomers}
        />
      )}
    </div>
  );
}
