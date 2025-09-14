# Software Requirements Specification (SRS)

## 1. Introduction

### 1.1 Purpose
This document describes the current software requirements for the FlutterPos system. It serves as the authoritative reference for functionality and must be kept up to date as the project evolves.

### 1.2 Scope
FlutterPos is a point-of-sale and management platform for laundry and product sales. The system includes a web client and an Express/Node.js backend.

### 1.3 Definitions, Acronyms, and Abbreviations
- **SRS**: Software Requirements Specification
- **API**: Application Programming Interface
- **POS**: Point of Sale

## 2. Overall Description

### 2.1 Product Perspective
The system consists of a React front end, an Express-based REST API, and a PostgreSQL database accessed through Drizzle ORM. WebSocket channels provide real-time features such as delivery updates and driver location tracking.

### 2.2 User Classes and Characteristics
- **Super Administrator** – full system access across branches.
- **Branch Administrator** – manages data for a single branch.
- **Staff** – handles day-to-day operations such as orders and payments.
- **Delivery Driver** – receives assigned deliveries and streams location updates.

### 2.3 Operating Environment
- Node.js runtime
- PostgreSQL database
- Modern web browser for the client interface

## 3. System Features and Requirements

### 3.1 Authentication and Authorization
- User login with session handling.
- Role-based access control for protected routes.

### 3.2 User Management
- Create, read, update, and deactivate users.
- Assign users to branches and roles.

### 3.3 Catalog Management
- Maintain categories, clothing items, products, and laundry services.
- Configure item–service pricing.

### 3.4 Customer Management
- Register and update customers.
- Track customer balances and contact information.

### 3.5 Orders and Transactions
- Create orders containing laundry services and product sales.
- Update order status (e.g., pending, processing, completed, delivered).
- Record transactions for auditing.

### 3.6 Payments and Billing
- Record payments against customer accounts or specific orders.
- Automatically adjust customer balances.
- Email receipts to customers.

### 3.7 Delivery Management
- List and filter delivery orders by status, driver, or branch.
- Assign drivers to delivery orders.
- Update delivery order status with validated transitions.
- WebSocket channel for broadcasting delivery order updates.
- Driver location streaming via WebSocket.

### 3.8 Reporting
- Sales summaries over selectable ranges.
- Top products and services reports.

### 3.9 Notifications
- Email service for sending receipts and other notifications.

### 3.10 Packages and Subscriptions
- Support prepaid packages and monthly subscription tiers with item-type restrictions.
- Assign packages to customers and track remaining credits.

## 4. Data Models
Key persistent entities include:
- Users and Roles
- Customers
- Products and Categories
- Laundry Services and Pricing
- Packages and Subscription Tiers
- Orders and Order Items
- Payments and Transactions
- Delivery Orders and Driver Locations

## 5. External Interface Requirements
- **REST API** under `/api/*` for CRUD operations and reporting.
- **WebSocket Endpoints** at `/ws/delivery-orders` and `/ws/driver-location`.

## 6. Non-functional Requirements
- Secure handling of credentials and sessions.
- Consistent API responses with error handling and logging.
- Responsive client UI with real-time feedback where appropriate.
- Regular database backups as described in [backup.md](./backup.md).

## 7. Maintenance
This SRS must be updated whenever routes, models, or feature behavior change. All contributors are responsible for keeping this document current. Run `npm run validate:srs` before committing to confirm that relevant changes are reflected here.

