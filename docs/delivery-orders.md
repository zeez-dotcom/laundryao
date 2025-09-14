# Delivery Orders API

`POST /delivery/orders`

Create a new delivery order for a customer.

## Lifecycle

Delivery orders move through the following statuses:

`request` → `accepted` → `driver_enroute` → `picked_up` → `started_processing` → `ready` → `out_for_delivery` → `completed`

## Consumer

Customers create delivery orders through the public web form. The request must
include the customer's session cookie; staff credentials are not accepted for
this endpoint.

## Authentication

A logged-in customer session is required. Requests without a valid session will
receive `401 Login required`.

## Request Body

```json
{
  "branchCode": "ABC",
  "address": "Street 123, City",
  "pickupTime": "2024-05-01T10:00:00Z",   // optional ISO string
  "dropoffTime": "2024-05-01T15:00:00Z",  // optional ISO string
  "dropoffLat": 24.7136,                   // optional latitude
  "dropoffLng": 46.6753,                   // optional longitude
  "scheduled": false,                      // optional, default false
  "items": [
    { "name": "Shirt", "quantity": 2, "price": 3.5 }
  ]
}
```

`dropoffLat` and `dropoffLng` may be supplied when the address is chosen via the
map interface. When omitted, the server will geocode the provided address.

## Response

Returns `201` on success:

```json
{ "orderId": "o1", "orderNumber": "ABC-0001" }
```

## GET /api/delivery-orders

Fetch delivery orders. Results are limited to the requester's branch unless the
user is a super admin. Query parameters:

- `status` – filter by delivery status
- `driverId` – filter by assigned driver
- `branchId` – specify branch (super admin only)

```
GET /api/delivery-orders?status=driver_enroute
```

```json
[
  {
    "id": "do1",
    "orderId": "o1",
    "deliveryStatus": "driver_enroute",
    "order": { "id": "o1", "orderNumber": "ABC-0001" }
  }
]
```

## PATCH /api/delivery-orders/:id/assign

Assign a driver to an existing delivery order. Only branch staff and super
admins may assign drivers.

```
PATCH /api/delivery-orders/o1/assign
{
  "driverId": "user123"
}
```

```json
{
  "id": "do1",
  "orderId": "o1",
  "driverId": "user123",
  "order": { "id": "o1", "orderNumber": "ABC-0001" }
}
```

## PATCH /api/delivery-orders/:id/status

Update the delivery status (`request`, `accepted`, `driver_enroute`,
`picked_up`, `started_processing`, `ready`, `out_for_delivery`, `completed`).
Invalid transitions return `400`.

```
PATCH /api/delivery-orders/o1/status
{
  "status": "out_for_delivery"
}
```

```json
{
  "id": "do1",
  "orderId": "o1",
  "deliveryStatus": "out_for_delivery",
  "order": { "id": "o1", "orderNumber": "ABC-0001" }
}
```
