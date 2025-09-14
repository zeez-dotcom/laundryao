import ExcelJS from "exceljs";

// Map of laundry service fields to their supported column headers.
// The first entry in each array is used when generating templates, but
// the parser will accept any of the listed headers.
export const SERVICE_HEADERS = {
  normalIron: ["Normal Iron Price", "Normal Iron"],
  normalWash: ["Normal Wash Price", "Normal Wash"],
  normalWashIron: [
    "Normal Wash & Iron Price",
    "Normal Wash & Iron",
  ],
  urgentIron: ["Urgent Iron Price", "Urgent Iron"],
  urgentWash: ["Urgent Wash Price", "Urgent Wash"],
  urgentWashIron: [
    "Urgent Wash & Iron Price",
    "Urgent Wash & Iron",
  ],
} as const;

// Helper function to extract string value from ExcelJS cell values
// ExcelJS can return objects for hyperlinks: { text: "url", hyperlink: "url" }
export function extractStringValue(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) {
    return "";
  }
  
  // Handle hyperlink objects
  if (typeof cellValue === "object" && cellValue.hyperlink) {
    return String(cellValue.hyperlink);
  }
  
  // Handle rich text objects
  if (typeof cellValue === "object" && cellValue.richText) {
    return cellValue.richText.map((rt: any) => rt.text || "").join("");
  }
  
  // Handle formula results
  if (typeof cellValue === "object" && cellValue.result !== undefined) {
    return String(cellValue.result);
  }
  
  // Default to string conversion
  return String(cellValue);
}

// Parse bilingual format "English//Arabic" or just "English"
export function parseInlineBilingual(input: string): { en: string; ar: string } {
  if (!input || typeof input !== 'string') {
    return { en: '', ar: '' };
  }
  
  if (input.includes('//')) {
    const [english, arabic] = input.split('//');
    return {
      en: english?.trim() || '',
      ar: arabic?.trim() || ''
    };
  }
  
  return {
    en: input.trim(),
    ar: ''
  };
}

export function parseWorksheetData(worksheet: ExcelJS.Worksheet): any[] {
  const headers: string[] = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "");
  });
  
  const data: any[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    const rowData: any = {};
    headers.forEach((header, index) => {
      rowData[header] = row.getCell(index + 1).value;
    });
    data.push(rowData);
  });
  
  return data;
}


export async function generateCatalogTemplate(): Promise<Buffer> {
  const serviceHeaders = [
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

  const serviceExampleRow = [
    "T-Shirt",
    "تي شيرت",
    5,
    10,
    15,
    8,
    12,
    18,
    "https://example.com/image.jpg",
  ];

  const productHeaders = [
    "Name (English)",
    "Name (Arabic)",
    "Description",
    "Category",
    "Price", 
    "Stock",
    "Item Type",
    "Picture Link",
  ];

  const productExampleRow = [
    "Laundry Detergent",
    "مسحوق الغسيل",
    "High-quality laundry detergent",
    "Cleaning Supplies",
    25.99,
    50,
    "everyday",
    "https://example.com/detergent.jpg",
  ];

  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Laundry Services
  const servicesWorksheet = workbook.addWorksheet("Laundry Services");
  servicesWorksheet.addRow(serviceHeaders);
  servicesWorksheet.addRow(serviceExampleRow);
  
  // Sheet 2: Retail Products
  const productsWorksheet = workbook.addWorksheet("Retail Products");
  productsWorksheet.addRow(productHeaders);
  productsWorksheet.addRow(productExampleRow);
  
  return (await workbook.xlsx.writeBuffer()) as Buffer;
}

export function parsePrice(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    return isNaN(value) ? undefined : value;
  }
  const normalized = String(value)
    .replace(/[^0-9,.-]/g, "")
    .replace(/,/g, ".");
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? undefined : parsed;
}

export interface ParsedProductRow {
  nameEn: string;
  nameAr?: string;
  description?: string;
  category?: string;
  price?: number;
  stock?: number;
  itemType?: "everyday" | "premium";
  imageUrl?: string;
}

export function parseProductRow(row: any, index: number, errors: string[]): ParsedProductRow | null {
  const nameEn = String(row["Name (English)"] ?? "").trim();
  const nameAr = row["Name (Arabic)"] ? String(row["Name (Arabic)"]).trim() : undefined;
  const description = row["Description"] ? String(row["Description"]).trim() : undefined;
  const category = row["Category"] ? String(row["Category"]).trim() : undefined;
  const imageUrl = row["Picture Link"] ? extractStringValue(row["Picture Link"]).trim() : undefined;
  
  if (!nameEn) {
    errors.push(`Row ${index + 2}: Name (English) is required`);
    return null;
  }

  const price = parsePrice(row["Price"]);
  if (price === undefined) {
    errors.push(`Row ${index + 2}: Valid price is required`);
    return null;
  }

  let stock = 0;
  if (row["Stock"] !== undefined && row["Stock"] !== null && row["Stock"] !== "") {
    const parsedStock = parseInt(String(row["Stock"]));
    if (isNaN(parsedStock) || parsedStock < 0) {
      errors.push(`Row ${index + 2}: Stock must be a non-negative number`);
      return null;
    }
    stock = parsedStock;
  }

  let itemType: "everyday" | "premium" = "everyday";
  if (row["Item Type"]) {
    const type = String(row["Item Type"]).toLowerCase().trim();
    if (type === "premium") {
      itemType = "premium";
    } else if (type !== "everyday") {
      errors.push(`Row ${index + 2}: Item Type must be 'everyday' or 'premium'`);
      return null;
    }
  }

  return {
    nameEn,
    nameAr,
    description,
    category,
    price,
    stock,
    itemType,
    imageUrl,
  };
}

// Parse pricing matrix format (user's Excel format)
export function parsePricingMatrixWorksheet(worksheet: ExcelJS.Worksheet): {
  clothingItems: Array<{ nameEn: string; nameAr: string; imageUrl?: string }>;
  services: Array<{ nameEn: string; nameAr: string }>;
  prices: Array<{ itemName: string; serviceName: string; price: number }>;
  errors: string[];
} {
  const errors: string[] = [];
  const clothingItems: Array<{ nameEn: string; nameAr: string; imageUrl?: string }> = [];
  const services: Array<{ nameEn: string; nameAr: string }> = [];
  const prices: Array<{ itemName: string; serviceName: string; price: number }> = [];

  try {
    // Get header row (services)
    const headerRow = worksheet.getRow(1);
    const serviceHeaders: string[] = [];
    
    headerRow.eachCell((cell, colNumber) => {
      if (colNumber > 1) { // Skip first column (Item names)
        const cellValue = extractStringValue(cell.value);
        if (cellValue && !cellValue.toLowerCase().includes('picture')) {
          serviceHeaders.push(cellValue);
          
          // Parse service name
          const serviceParsed = parseInlineBilingual(cellValue);
          if (serviceParsed.en) {
            services.push({
              nameEn: serviceParsed.en,
              nameAr: serviceParsed.ar
            });
          }
        }
      }
    });

    // Process item rows
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row
      
      const firstCell = row.getCell(1);
      const itemName = extractStringValue(firstCell.value);
      
      if (!itemName) return;
      
      // Parse item name
      const itemParsed = parseInlineBilingual(itemName);
      if (!itemParsed.en) {
        errors.push(`Row ${rowNumber}: Item name is required`);
        return;
      }
      
      // Check for image URL (last column)
      let imageUrl: string | undefined;
      const lastColIndex = row.cellCount;
      if (lastColIndex > serviceHeaders.length + 1) {
        const imageCell = row.getCell(lastColIndex);
        const imageValue = extractStringValue(imageCell.value);
        if (imageValue && (imageValue.startsWith('http') || imageValue.startsWith('https'))) {
          imageUrl = imageValue;
        }
      }
      
      clothingItems.push({
        nameEn: itemParsed.en,
        nameAr: itemParsed.ar,
        imageUrl
      });
      
      // Process pricing data for this item
      serviceHeaders.forEach((serviceHeader, serviceIndex) => {
        const priceCell = row.getCell(serviceIndex + 2); // +2 because first col is item, second col starts services
        const priceValue = priceCell.value;
        
        if (priceValue !== null && priceValue !== undefined && priceValue !== '') {
          const price = parsePrice(priceValue);
          if (price !== undefined && price > 0) {
            const serviceParsed = parseInlineBilingual(serviceHeader);
            prices.push({
              itemName: itemParsed.en,
              serviceName: serviceParsed.en,
              price
            });
          }
        }
      });
    });
    
  } catch (error) {
    errors.push(`Error parsing worksheet: ${error}`);
  }

  return {
    clothingItems,
    services,
    prices,
    errors
  };
}
