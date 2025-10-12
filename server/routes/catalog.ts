import type { Express, RequestHandler } from "express";
import type { Multer } from "multer";
import ExcelJS from "exceljs";
import type { Logger } from "pino";
import { z } from "zod";
import { eq, like, or } from "drizzle-orm";
import {
  categories,
  clothingItems,
  laundryServices,
  type UserWithBranch,
} from "@shared/schema";

import type { IStorage, ParsedRow } from "../storage";
import { db } from "../db";
import {
  SERVICE_HEADERS,
  extractStringValue,
  generateCatalogTemplate,
  parseInlineBilingual,
  parsePrice,
  parseProductRow,
  parseWorksheetData,
  parsePricingMatrixWorksheet,
} from "../utils/excel";

const branchSelectionSchema = z.object({
  branchId: z
    .string()
    .optional()
    .transform((value): string | undefined => (value && value.trim().length > 0 ? value : undefined)),
});

type BranchCatalogResult = Awaited<ReturnType<IStorage["bulkUpsertBranchCatalog"]>> & {
  newClothingItemIds?: string[];
  newServiceIds?: string[];
};

type ProductUpsertResult = Awaited<ReturnType<IStorage["bulkUpsertProducts"]>>;

interface CatalogRoutesDeps {
  app: Express;
  storage: IStorage;
  logger: Logger;
  requireAuth: RequestHandler;
  requireAdminOrSuperAdmin: RequestHandler;
  upload: Multer;
}

export function registerCatalogRoutes({
  app,
  storage,
  logger,
  requireAuth,
  requireAdminOrSuperAdmin,
  upload,
}: CatalogRoutesDeps): void {
  app.post("/api/admin/backfill-bilingual", requireAdminOrSuperAdmin, async (_req, res) => {
    try {
      const clothingRows = await db
        .select()
        .from(clothingItems)
        .where(or(like(clothingItems.name, "%//%"), like(clothingItems.description, "%//%")));
      let clothingUpdated = 0;
      for (const row of clothingRows) {
        const needsName = (!row.nameAr || row.nameAr === "") && typeof row.name === "string" && row.name.includes("//");
        const needsDesc =
          (!row.descriptionAr || row.descriptionAr === "") &&
          typeof row.description === "string" &&
          row.description.includes("//");
        if (!needsName && !needsDesc) continue;
        const patch: Partial<typeof clothingItems.$inferInsert> = {};
        if (needsName) {
          const parts = parseInlineBilingual(String(row.name));
          patch.name = parts.en || row.name;
          if (parts.ar) patch.nameAr = parts.ar;
        }
        if (needsDesc) {
          const parts = parseInlineBilingual(String(row.description || ""));
          if (parts.en) patch.description = parts.en;
          if (parts.ar) patch.descriptionAr = parts.ar;
        }
        if (Object.keys(patch).length) {
          await db.update(clothingItems).set(patch).where(eq(clothingItems.id, row.id));
          clothingUpdated++;
        }
      }

      const serviceRows = await db
        .select()
        .from(laundryServices)
        .where(or(like(laundryServices.name, "%//%"), like(laundryServices.description, "%//%")));
      let servicesUpdated = 0;
      for (const row of serviceRows) {
        const needsName = (!row.nameAr || row.nameAr === "") && typeof row.name === "string" && row.name.includes("//");
        const needsDesc =
          (!row.descriptionAr || row.descriptionAr === "") &&
          typeof row.description === "string" &&
          row.description.includes("//");
        if (!needsName && !needsDesc) continue;
        const patch: Partial<typeof laundryServices.$inferInsert> = {};
        if (needsName) {
          const parts = parseInlineBilingual(String(row.name));
          patch.name = parts.en || row.name;
          if (parts.ar) patch.nameAr = parts.ar;
        }
        if (needsDesc) {
          const parts = parseInlineBilingual(String(row.description || ""));
          if (parts.en) patch.description = parts.en;
          if (parts.ar) patch.descriptionAr = parts.ar;
        }
        if (Object.keys(patch).length) {
          await db.update(laundryServices).set(patch).where(eq(laundryServices.id, row.id));
          servicesUpdated++;
        }
      }

      const categoryRows = await db
        .select()
        .from(categories)
        .where(or(like(categories.name, "%//%"), like(categories.description, "%//%")));
      let categoriesUpdated = 0;
      for (const row of categoryRows) {
        const needsName = (!row.nameAr || row.nameAr === "") && typeof row.name === "string" && row.name.includes("//");
        const needsDesc =
          (!row.descriptionAr || row.descriptionAr === "") &&
          typeof row.description === "string" &&
          row.description.includes("//");
        if (!needsName && !needsDesc) continue;
        const patch: Partial<typeof categories.$inferInsert> = {};
        if (needsName) {
          const parts = parseInlineBilingual(String(row.name));
          patch.name = parts.en || row.name;
          if (parts.ar) patch.nameAr = parts.ar;
        }
        if (needsDesc) {
          const parts = parseInlineBilingual(String(row.description || ""));
          if (parts.en) patch.description = parts.en;
          if (parts.ar) patch.descriptionAr = parts.ar;
        }
        if (Object.keys(patch).length) {
          await db.update(categories).set(patch).where(eq(categories.id, row.id));
          categoriesUpdated++;
        }
      }

      res.json({ clothingItemsUpdated: clothingUpdated, servicesUpdated, categoriesUpdated });
    } catch (error) {
      logger.error({ err: error }, "Backfill bilingual failed");
      res.status(500).json({ message: "Backfill failed" });
    }
  });

  app.get("/api/catalog/export", requireAuth, async (req, res) => {
    try {
      const currentUser = req.user as UserWithBranch;
      const rows = await storage.getCatalogForExport(currentUser.id);
      const headers = [
        "Item (English)",
        "Item (Arabic)",
        SERVICE_HEADERS.normalIron[0],
        SERVICE_HEADERS.normalWash[0],
        SERVICE_HEADERS.normalWashIron[0],
        SERVICE_HEADERS.urgentIron[0],
        SERVICE_HEADERS.urgentWash[0],
        SERVICE_HEADERS.urgentWashIron[0],
        "Picture Link",
      ];
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Catalog");
      worksheet.addRow(headers);
      rows.forEach((row) =>
        worksheet.addRow([
          row.itemEn,
          row.itemAr ?? "",
          row.normalIron ?? "",
          row.normalWash ?? "",
          row.normalWashIron ?? "",
          row.urgentIron ?? "",
          row.urgentWash ?? "",
          row.urgentWashIron ?? "",
          row.imageUrl ?? "",
        ]),
      );
      const buf = (await workbook.xlsx.writeBuffer()) as Buffer;
      res.setHeader("Content-Disposition", "attachment; filename=catalog.xlsx");
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.send(Buffer.from(buf));
    } catch (err) {
      logger.error({ err }, "Catalog export failed");
      res.status(500).json({ message: "Failed to export catalog" });
    }
  });

  app.get("/api/catalog/bulk-template", requireAuth, async (_req, res) => {
    const buf = await generateCatalogTemplate();
    res.setHeader("Content-Disposition", "attachment; filename=catalog_template.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(Buffer.from(buf));
  });

  app.post(
    "/api/catalog/bulk-upload",
    requireAuth,
    upload.single("file"),
    async (req, res) => {
      try {
        const currentUser = req.user as UserWithBranch;
        const { branchId } = branchSelectionSchema.parse(req.body);
        if (!req.file) {
          return res.status(400).json({ message: "file is required" });
        }
        if (branchId && currentUser.role !== "super_admin") {
          return res
            .status(403)
            .json({ message: "Only super admin can specify branchId" });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const errors: string[] = [];
        let servicesResult: BranchCatalogResult | null = null;
        let productsResult: ProductUpsertResult | null = null;
        let newClothingItemIds: string[] = [];
        let newServiceIds: string[] = [];

        const targetBranchId = branchId && currentUser.role === "super_admin" ? branchId : currentUser.branchId;
        if (!targetBranchId) {
          return res.status(400).json({ message: "Branch ID is required" });
        }

        const mainSheet = workbook.worksheets[0];
        if (mainSheet) {
          const matrixResult = parsePricingMatrixWorksheet(mainSheet);

          if (matrixResult.clothingItems.length > 0 && matrixResult.services.length > 0) {
            errors.push(...matrixResult.errors);

            if (matrixResult.errors.length === 0) {
              const rows: ParsedRow[] = [];

              const servicePriceMap = new Map<string, Map<string, number>>();
              matrixResult.prices.forEach(({ itemName, serviceName, price }) => {
                if (!servicePriceMap.has(itemName)) {
                  servicePriceMap.set(itemName, new Map());
                }
                servicePriceMap.get(itemName)!.set(serviceName, price);
              });

              matrixResult.clothingItems.forEach((item) => {
                const itemPrices = servicePriceMap.get(item.nameEn) || new Map<string, number>();

                const normalIron = itemPrices.get("Normal Iron") || itemPrices.get("كي عادي");
                const normalWash = itemPrices.get("Normal Wash") || itemPrices.get("غسيل عادي");
                const normalWashIron =
                  itemPrices.get("Normal Wash & Iron") ||
                  itemPrices.get("Normal Wash and Iron") ||
                  itemPrices.get("Normal Wash&Iron") ||
                  itemPrices.get("غسيل وكي عادي");
                const urgentIron = itemPrices.get("Urgent Iron") || itemPrices.get("كي مستعجل");
                const urgentWash = itemPrices.get("Urgent Wash") || itemPrices.get("غسيل مستعجل");
                const urgentWashIron =
                  itemPrices.get("Urgent Wash & Iron") ||
                  itemPrices.get("Urgent Wash and Iron") ||
                  itemPrices.get("Urgent Wash&Iron") ||
                  itemPrices.get("غسيل وكي مستعجل");

                rows.push({
                  itemEn: item.nameEn,
                  itemAr: item.nameAr || undefined,
                  normalIron,
                  normalWash,
                  normalWashIron,
                  urgentIron,
                  urgentWash,
                  urgentWashIron,
                  imageUrl: item.imageUrl,
                });
              });

              if (rows.length > 0) {
                servicesResult = await storage.bulkUpsertBranchCatalog(targetBranchId, rows);
                newClothingItemIds = servicesResult.newClothingItemIds ?? [];
                newServiceIds = servicesResult.newServiceIds ?? [];
              }
            }
          } else {
            const laundryData = parseWorksheetData(mainSheet);
            const rows: ParsedRow[] = [];
            laundryData.forEach((r, index) => {
              const getFieldValue = (fields: readonly string[]) => {
                for (const f of fields) {
                  if (r[f] !== undefined && r[f] !== null && r[f] !== "") {
                    return r[f];
                  }
                }
                return undefined;
              };

              const parseField = (fields: readonly string[]) => {
                const raw = getFieldValue(fields);
                const parsed = parsePrice(raw);
                if (raw !== undefined && raw !== null && raw !== "" && parsed === undefined) {
                  errors.push(`Row ${index + 2}: Invalid ${fields[0]}`);
                }
                return parsed;
              };

              const itemEnSource = getFieldValue([
                "Item (English)",
                "Item English",
                "Item Name",
                "Item",
                "Item English Name",
                "Item English (Required)",
                "Clothing Item",
              ]);

              const itemEn = itemEnSource ? extractStringValue(itemEnSource).trim() : "";

              if (!itemEn) {
                errors.push(`Row ${index + 2}: Missing item name`);
                return;
              }

              const itemArSource = getFieldValue([
                "Item (Arabic)",
                "Item Arabic",
                "Item Arabic Name",
                "Arabic Name",
              ]);
              const itemAr = itemArSource ? extractStringValue(itemArSource).trim() : "";

              const imageSource = getFieldValue([
                "Picture Link",
                "Image URL",
                "Image",
                "Image Link",
              ]);
              const imageUrl = imageSource ? extractStringValue(imageSource).trim() : "";

              rows.push({
                itemEn,
                itemAr: itemAr ? itemAr : undefined,
                normalIron: parseField(SERVICE_HEADERS.normalIron),
                normalWash: parseField(SERVICE_HEADERS.normalWash),
                normalWashIron: parseField(SERVICE_HEADERS.normalWashIron),
                urgentIron: parseField(SERVICE_HEADERS.urgentIron),
                urgentWash: parseField(SERVICE_HEADERS.urgentWash),
                urgentWashIron: parseField(SERVICE_HEADERS.urgentWashIron),
                imageUrl: imageUrl ? imageUrl : undefined,
              });
            });

            if (rows.length > 0) {
              servicesResult = await storage.bulkUpsertBranchCatalog(targetBranchId, rows);
              newClothingItemIds = servicesResult.newClothingItemIds ?? [];
              newServiceIds = servicesResult.newServiceIds ?? [];
            }
          }
        }

        const productsSheet = workbook.worksheets.find((ws) => ws.name === "Retail Products");
        if (productsSheet) {
          const productData = parseWorksheetData(productsSheet);
          const productRows = productData
            .map((row, index) => parseProductRow(row, index, errors))
            .filter((row): row is NonNullable<ReturnType<typeof parseProductRow>> => row !== null);

          if (productRows.length > 0) {
            productsResult = await storage.bulkUpsertProducts(targetBranchId, productRows);
            errors.push(...productsResult.errors);
          }
        }

        if (errors.length > 0) {
          return res.status(400).json({ errors });
        }

        if (newClothingItemIds.length > 0 || newServiceIds.length > 0) {
          try {
            await storage.syncPackagesWithNewItems(targetBranchId, newClothingItemIds, newServiceIds);
          } catch (syncError) {
            logger.warn({ err: syncError }, "Package sync warning");
          }
        }

        const result = servicesResult ?? {
          processed: 0,
          created: 0,
          updated: 0,
          clothingItemsCreated: 0,
          clothingItemsUpdated: 0,
          userResults: [],
        };

        res.json({
          processed: result.processed || 0,
          created: result.created || 0,
          updated: result.updated || 0,
          clothingItemsCreated: result.clothingItemsCreated || 0,
          clothingItemsUpdated: result.clothingItemsUpdated || 0,
          branchId: targetBranchId,
          userResults: result.userResults || [],
          packagesSync: newClothingItemIds.length > 0 || newServiceIds.length > 0 ? "completed" : "not_needed",
          products: productsResult,
        });
      } catch (error) {
        logger.error({ err: error }, "Bulk upload failed");
        res.status(500).json({ message: "Bulk upload failed" });
      }
    },
  );
}
