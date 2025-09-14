# Default Catalog

This system ships with a pre-seeded catalog of laundry service categories, clothing items, and prices. The data is inserted automatically when a new user account is created.

## Categories

| Type | English Name | Arabic Name |
| --- | --- | --- |
| Service | Normal Iron | كي عادي |
| Service | Normal Wash | غسيل عادي |
| Service | Normal Wash & Iron | غسيل وكي عادي |
| Service | Urgent Iron | كي مستعجل |
| Service | Urgent Wash | غسيل مستعجل |
| Service | Urgent Wash & Iron | غسيل وكي مستعجل |
| Clothing | Clothing Items | ملابس |

## Price Matrix

Prices are defined for each clothing item across all service categories. The matrix below shows how services map to clothing items.

| Clothing Item | Normal Iron | Normal Wash | Normal Wash & Iron | Urgent Iron | Urgent Wash | Urgent Wash & Iron |
| --- | --- | --- | --- | --- | --- | --- |
| Thobe (ثوب) | 4 | 5 | 7 | 6 | 7 | 9 |
| Shirt (قميص) | 2 | 3 | 4 | 3.5 | 4.5 | 5.5 |
| T-Shirt (تيشيرت) | 1.5 | 2.5 | 3.5 | 3 | 4 | 5 |
| Trouser (بنطال) | 2.5 | 3.5 | 4.5 | 4 | 5 | 6 |

## Seeding and Customization

Ensure `DATABASE_URL` is set in your environment, then generate and apply migrations before seeding the default catalog data:

```bash
npm run db:generate
npm run db:migrate
npm run dev
```

The seed creates a `superadmin` user with password `admin123`. Seeds are idempotent, so re-running the command is safe.

During user creation the server seeds:

- **Categories** using the list above
- **Clothing items** such as Thobe, Shirt, T-Shirt and Trouser
- **Laundry services** for every clothing item and service category combination

After onboarding, administrators can customize the catalog through the **Admin → Categories** section by adding new categories, editing names or translations, and adjusting service prices.

## Exporting Inventory

The inventory screen now includes a **Download Inventory** button. Clicking it requests `GET /api/catalog/export` and downloads an Excel file containing all clothing items and their service prices. The spreadsheet follows the same format as the bulk upload template, making it easy to review or modify pricing offline.

## Uploading Inventory

Use the **Upload Inventory** button on the inventory screen to import catalog changes from an Excel spreadsheet. Selecting a file sends it to `POST /api/catalog/bulk-upload` for processing. If validation fails, the server returns detailed error messages indicating the row and column with the issue.

Hover over the upload button to access a link for downloading a blank template from `/api/catalog/bulk-template`.

### Required Excel Format

The spreadsheet must contain the following columns:

| Column | Description |
| --- | --- |
| Item (English) | Required item name |
| Item (Arabic) | Optional Arabic name |
| Normal Iron Price | Price for normal iron service |
| Normal Wash Price | Price for normal wash service |
| Normal Wash & Iron Price | Price for normal wash & iron service |
| Urgent Iron Price | Price for urgent iron service |
| Urgent Wash Price | Price for urgent wash service |
| Urgent Wash & Iron Price | Price for urgent wash & iron service |
| Picture Link | Optional image URL |

## Chat Edit Assistant

The inventory screen includes a **Chat Edit Assistant** button. Clicking it opens a guided chatbot that walks administrators through updating clothing items and laundry services. The assistant prompts you to choose whether to edit a clothing item or a service, then shows a list of entries with thumbnail images for quick visual reference. After selecting an entry, the assistant displays the current value of the field you're about to edit before letting you decide whether to change its image, name, or price. For clothing item prices, you'll also pick the service before entering a new value. After each update the assistant confirms the change and lets you continue editing or exit.

### Refreshed Interface

The Chat Edit Assistant now presents messages in rounded **avatar-based chat bubbles** so it's easy to see who said what at a glance. A persistent text field with a dedicated **send button** sits at the bottom of the panel, and both incoming and outgoing messages animate smoothly into place with subtle fades and slides.

![Chat Edit Assistant showing thumbnails and enlarged panel](./chat-edit-assistant.png)

### Shortcuts & Accessibility

- Press **Enter** to send a message and **Shift+Enter** to insert a new line.
- The send button and message field expose clear ARIA labels for screen readers.
- Keyboard focus outlines and high contrast colors improve visibility for low‑vision users.

