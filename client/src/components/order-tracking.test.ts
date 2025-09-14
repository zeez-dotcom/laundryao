import { describe, expect, it } from 'vitest';
import { getItemsSummary, OrderItem, matchesOrderSearch, sortOrders } from './order-tracking';
import { loadLocale } from '../lib/i18n';

describe('getItemsSummary', () => {
  it('formats items with string values', async () => {
    const items: OrderItem[] = [
      { clothingItem: 'Shirt', service: 'Wash', quantity: 2 },
      { clothingItem: 'Pants', service: 'Dry', quantity: 1 },
    ];
    const tEn = await loadLocale('en');
    expect(getItemsSummary(items, tEn)).toBe('2x Shirt (Wash), 1x Pants (Dry)');
  });

  it('formats items with object values', async () => {
    const items: OrderItem[] = [
      { clothingItem: { name: 'Jacket' }, service: { name: 'Dry Clean' }, quantity: 3 },
    ];
    const tEn = await loadLocale('en');
    expect(getItemsSummary(items, tEn)).toBe('3x Jacket (Dry Clean)');
  });
});

describe('order search and sort', () => {
  it('matches search by nickname', () => {
    const order: any = {
      orderNumber: '001',
      customerName: 'Alice',
      customerPhone: '123',
      customerNickname: 'ally',
      createdAt: new Date().toISOString(),
    };
    expect(matchesOrderSearch(order, 'ally')).toBe(true);
    expect(matchesOrderSearch(order, '123')).toBe(true);
    expect(matchesOrderSearch(order, 'alice')).toBe(true);
    expect(matchesOrderSearch(order, 'bob')).toBe(false);
  });

  it('sorts by balance due and date', () => {
    const orders: any[] = [
      { createdAt: '2024-01-01', balanceDue: '5', orderNumber: '1', customerName: 'A', customerPhone: '1' },
      { createdAt: '2024-01-02', balanceDue: '10', orderNumber: '2', customerName: 'B', customerPhone: '2' },
    ];
    const byBalance = sortOrders(orders, 'balanceDue', 'desc');
    expect(byBalance[0].balanceDue).toBe('10');
    const byDate = sortOrders(orders, 'createdAt', 'asc');
    expect(byDate[0].createdAt).toBe('2024-01-01');
  });
});
