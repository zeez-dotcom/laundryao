import { useState, useEffect } from 'react';

export type Currency = 'USD' | 'KWD' | 'EUR' | 'SAR' | 'AED';

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  name: string;
  decimals: number;
  position: 'before' | 'after';
}

const currencyConfigs: Record<Currency, CurrencyConfig> = {
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimals: 2,
    position: 'before'
  },
  KWD: {
    code: 'KWD',
    symbol: 'KD',
    name: 'Kuwaiti Dinar',
    decimals: 3,
    position: 'after'
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    decimals: 2,
    position: 'before'
  },
  SAR: {
    code: 'SAR',
    symbol: 'SR',
    name: 'Saudi Riyal',
    decimals: 2,
    position: 'after'
  },
  AED: {
    code: 'AED',
    symbol: 'AED',
    name: 'UAE Dirham',
    decimals: 2,
    position: 'after'
  }
};

export const useCurrency = () => {
  const [currency, setCurrency] = useState<Currency>(() => {
    return (localStorage.getItem('systemCurrency') as Currency) || 'KWD';
  });

  useEffect(() => {
    localStorage.setItem('systemCurrency', currency);
  }, [currency]);

  const formatCurrency = (amount: string | number) => {
    const config = currencyConfigs[currency];
    const raw = typeof amount === 'string' ? parseFloat(amount) : amount;
    const num = Number.isFinite(raw) ? raw : 0;
    const formattedAmount = num.toFixed(config.decimals);

    return config.position === 'before'
      ? `${config.symbol}${formattedAmount}`
      : `${formattedAmount} ${config.symbol}`;
  };

  const getCurrencyConfig = () => currencyConfigs[currency];
  
  const getAllCurrencies = () => Object.values(currencyConfigs);

  return {
    currency,
    setCurrency,
    formatCurrency,
    getCurrencyConfig,
    getAllCurrencies
  };
};
