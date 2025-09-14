# Packages and Subscription Tiers

The server seeds a set of default packages and subscription tiers when it starts.  Seed definitions live in `server/seed-data.ts` and are inserted by the `seedPackages` script.

Packages can be managed in the POS through the **Settings → Packages** tab, which is available to all roles.

## Default Packages

| Name | Max Items | Price |
| --- | --- | --- |
| Standard 10 | 10 | 30.00 |
| Premium 10 | 10 | 50.00 |

## Default Subscription Tiers

| Name | Max Items | Price |
| --- | --- | --- |
| Standard Monthly | 30 | 100.00 |
| Premium Monthly | 30 | 150.00 |

## Package Seed Format

Each package definition now includes a `packageItems` array that lists the products a package grants and how many credits each product receives:

```ts
{
  nameEn: "Standard 10",
  price: "30.00",
  maxItems: 10,
  packageItems: [
    { productId: "prod-everyday-1", credits: 10 },
  ],
}
```

## Extending for Promotions

1. Open `server/seed-data.ts` and add a new object to `PACKAGE_SEEDS` or `SUBSCRIPTION_TIER_SEEDS`.
2. Populate the `packageItems` array with the specific product IDs and credit allocations for the promotion. Optional fields like `bonusCredits` or `expiryDays` can be provided as needed.
3. Restart the server (or run `seedPackages()` manually) to insert the new entries.

This approach keeps promotional packages under version control and ensures consistent seeding across environments.
