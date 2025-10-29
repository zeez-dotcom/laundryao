Mobile API Guide (Customer App)

Auth
- POST /customer/login { phoneNumber, password }
  - 200: Customer, sets session cookie
- GET /customer/me
  - 200: { id, name, branchId, balanceDue, ... }

Orders
- GET /customer/orders
  - 200: [{ id, orderNumber, createdAt, status, subtotal, paid, remaining }]
- GET /customer/orders/:id/receipt
  - 200: Full receipt payload for printing

Deliveries
- GET /customer/deliveries
  - 200: [{ id, orderId, orderNumber, createdAt, status, deliveryStatus, scheduledDeliveryTime }]
- Portal tracking deep link:
  - /portal/delivery-tracking?deliveryId=...

Ordering
- POST /api/delivery-orders
  - Body: { customerId, branchCode, items[], deliveryAddressId?, deliveryInstructions?, paymentMethod }
  - Returns: { orderId, orderNumber, total }

Customer Addresses
- GET /customer/addresses
- POST /customer/addresses { label, address, cityId?, governorateId?, lat?, lng? }

Cities & Branch
- GET /api/cities → list of active cities
- GET /api/branches/:code → { name, code, serviceCityIds, deliveryEnabled }

Payments
- GET /api/customers/:customerId/payments → history
- POST /api/customers/:customerId/payments → record payment (for pay-on-pickup)

Chat (WebSocket)
- WS /ws/customer-chat?branchCode=BRANCH
  - Send: { type: 'chat', text: 'Hello' }
  - Receive: { eventType: 'chat:message', text, sender: 'customer'|'staff', timestamp }

Notes
- All requests use session cookies; configure dio with cookie persistence.
- Use /customer/me to fetch balanceDue and show outstanding amount.

