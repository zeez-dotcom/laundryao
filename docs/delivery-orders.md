# Delivery Orders API

`POST /delivery/orders`

Create a new delivery order for a customer.

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
