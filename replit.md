# Laundry Management System

## Overview

This is a modern laundry management system built with React/TypeScript frontend and Express.js backend, using Drizzle ORM with PostgreSQL for data persistence. The application features a responsive design optimized for laundry service environments, with support for clothing item selection, service management, cart functionality, and transaction processing. Customers can select clothing items (pants, dishdashas, shirts, etc.) and choose from various laundry services (wash & fold, dry cleaning, express service, etc.).

## Onboarding

When a new user account is created, the system seeds default service categories and clothing items. Review the default catalog and price matrix in [docs/catalog.md](docs/catalog.md) and adjust them later through **Admin → Categories**.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and building
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom POS-themed color scheme
- **State Management**: React hooks with custom cart management logic
- **Data Fetching**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL (configured via DATABASE_URL)
- **Session Storage**: PostgreSQL session store using connect-pg-simple
- **Build Process**: ESBuild for server-side bundling

### Data Storage
- **Primary Database**: PostgreSQL via Neon Database serverless connection
- **ORM**: Drizzle ORM with schema-first approach
- **Migration Management**: Drizzle Kit for database migrations
- **Schema Location**: `shared/schema.ts` for type sharing between client/server
- **Fallback Storage**: In-memory storage implementation for development/testing

## Key Components

### Database Schema
- **Clothing Items Table**: Stores clothing item information (name, description, category, image URL) - no pricing as services determine cost
- **Laundry Services Table**: Stores available services (name, description, price, category) - wash & fold, dry cleaning, ironing, etc.
- **Transactions Table**: Records completed orders with items (JSONB), totals, payment method, and timestamps
- **Schema Validation**: Zod schemas generated from Drizzle tables for runtime validation

### Frontend Components
- **Laundry Interface**: Main service interface with clothing selection and cart sidebar
- **Clothing Grid**: Displays clothing items with category filtering and search functionality
- **Service Selection Modal**: Modal for selecting laundry services after choosing clothing items
- **Laundry Cart Sidebar**: Manages cart items showing clothing + service combinations with quantity controls
- **Receipt Modal**: Displays transaction receipts with print/email options
- **Responsive Design**: Mobile-first approach with bottom navigation for mobile devices

### Backend API Routes
- **Clothing Items API**: GET /api/clothing-items (with category/search filtering), GET /api/clothing-items/:id
- **Laundry Services API**: GET /api/laundry-services (with category/search filtering), GET /api/laundry-services/:id
- **Transactions API**: POST /api/transactions for order processing
- **Service Management**: No stock tracking needed as laundry services are unlimited capacity
- **Reports API**:
  - `GET /api/reports/orders?range=daily|weekly|monthly|yearly` → `{ totalOrders, totalRevenue, stats: [{ period, count, revenue }] }`
  - `GET /api/reports/top-services?range=daily|weekly|monthly|yearly` → `{ services: [{ service, count, revenue }] }`
  - `GET /api/reports/top-products?range=daily|weekly|monthly|yearly` → `{ products: [{ product, count, revenue }] }`

### Cart Management
- **Local State**: Custom React hook managing laundry cart items (clothing + service combinations)
- **Unique Item Identification**: Each cart item combines clothing item ID and service ID for uniqueness
- **Tax Calculation**: Configurable tax rate (8.5% default)
- **Payment Methods**: Support for cash and card payments
- **Real-time Updates**: Immediate UI updates with server synchronization

## Data Flow

1. **Clothing Selection**: Frontend fetches clothing items from `/api/clothing-items` with optional filtering
2. **Service Selection**: User clicks clothing item → modal opens → fetches services from `/api/laundry-services`
3. **Cart Operations**: User selects service + quantity → adds clothing+service combination to cart
4. **Order Processing**: Cart data sent to `/api/transactions` endpoint for completion
5. **Receipt Generation**: Transaction data returned for receipt display
6. **Cache Invalidation**: React Query cache updated after successful transactions

## External Dependencies

### UI/UX Libraries
- **Radix UI**: Headless UI components for accessibility and functionality
- **Tailwind CSS**: Utility-first CSS framework with custom POS theme
- **Lucide React**: Icon library for consistent iconography
- **shadcn/ui**: Pre-built component library with consistent design system

### Development Tools
- **Replit Integration**: Custom plugins for development environment
- **TypeScript**: Full type safety across client and server
- **ESLint/Prettier**: Code quality and formatting (implied by modern setup)

### Database & Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting
- **Drizzle Kit**: Database migration and introspection tools

## Deployment Strategy

### Development Environment
- **Vite Dev Server**: Hot module replacement for frontend development. Defaults to port `5002` and uses the same port for HMR. Ensure any proxy or container forwards WebSocket traffic on this port or update the browser's base URL.
- **Express Server**: Serves API routes and static files in production
- **Database Migrations**: Manual execution via `npm run db:generate` and `npm run db:migrate`
- **Environment Variables**:
  - `DATABASE_URL` PostgreSQL connection string

### Production Build
- **Frontend Build**: Vite builds React app to `dist/public`
- **Backend Build**: ESBuild bundles server code to `dist/index.js`
- **Static File Serving**: Express serves built frontend files
- **Single Port Deployment**: Backend serves both API and frontend routes

### Configuration Management
- **Shared Types**: TypeScript types shared between client/server via `shared/` directory
- **Path Aliases**: Configured for clean imports (`@/`, `@shared/`)
- **Build Scripts**: Separate development and production build processes
- **Database Setup**: Drizzle migrations handle schema deployment
- **Initial Categories**: Seed categories (e.g., pants, shirts) before adding clothing items

## Recent Changes (July 2025)

- **System Transformation**: Converted from traditional POS system to laundry management system
- **New Data Models**: Separated clothing items (no pricing) from laundry services (with pricing)
- **Enhanced User Flow**: Two-step selection process - first clothing item, then service type
- **Service Categories**: Basic, Premium, Specialty, and Express service categories
- **Cart Logic**: Combined clothing + service items with unique identifiers for proper cart management
- **Database Migration**: Successfully migrated from in-memory storage to PostgreSQL database using Neon
  - Implemented DatabaseStorage class replacing MemStorage
  - Pushed schema to production database using Drizzle Kit
  - Populated database with initial clothing items and laundry services data
  - All API endpoints now use persistent PostgreSQL storage
- **Authentication System**: Implemented comprehensive user authentication and authorization
  - Added bcryptjs password hashing and Passport.js local strategy
  - Created role-based access control (user, admin, super_admin)
  - Built admin dashboard with category and user management
  - Auto-created super admin account: username "superadmin", password "laundry123"
  - Fixed password hash issue and verified session management
  - Integrated custom laundry logo in header and admin interface
- **Customer Management System**: Full pay-later functionality implemented
  - Customer database with phone number tracking and balance management
  - Customer lookup by phone for quick order association
  - Payment recording system to track and reduce outstanding balances
  - Customer profiles with loyalty points and total spent tracking
- **Order Tracking System**: Complete order lifecycle management
  - Order status progression: Received → Processing → Washing → Drying → Ready → Completed
  - Order management with customer association and payment method tracking
  - Real-time status updates and estimated pickup dates
  - Order history and customer order tracking
- **Business Reports Dashboard**: Financial and operational analytics
  - Revenue tracking by time period (today, week, month, all time)
  - Outstanding balance monitoring for pay-later customers
  - Payment method breakdown and cash flow analysis
  - Service popularity analytics and operational metrics
  - Order status pipeline reporting
- **Enhanced Navigation**: Updated POS interface with new feature modules
  - Added Customers, Orders, and Reports navigation sections
  - Integrated new components into existing POS workflow
  - Mobile-responsive navigation updates
  - Packages management moved to the **Settings → Packages** tab accessible to all roles
  - Fixed duplicate settings entries in sidebar navigation
- **UI Streamlining (July 2025)**: Comprehensive interface improvements
  - Streamlined orders page with compact layout and currency integration
  - Fixed undefined categories issue with proper fallback handling
  - Streamlined reports page with efficient card layouts and better organization
  - Improved responsive design across all management interfaces
  - Consistent currency formatting throughout all components

The application is designed as a full-stack monorepo with clear separation between client and server code, while maintaining shared type safety and efficient development workflows. The laundry-specific workflow allows customers to specify quantities of different clothing items and select appropriate services for each item type.

## Pay-Later Functionality
The system now supports comprehensive pay-later operations:
- Customer accounts tracked by unique phone numbers
- Balance accumulation for pay-later orders
- Payment recording to reduce outstanding balances  
- Customer payment history and transaction tracking
- Real-time balance updates during order processing

## Order Management Features
Complete order lifecycle with status tracking:
- Order creation with customer association (optional)
- Status progression through washing stages
- Estimated pickup date tracking
- Order search and filtering capabilities
- Customer order history access

## Business Intelligence
Financial reporting and analytics dashboard:
- Revenue tracking across multiple time periods
- Outstanding balance monitoring and alerts
- Payment method analysis and cash flow reports
- Service popularity metrics for business decisions
- Customer activity and loyalty tracking