import { db } from "./db";
import { cities } from "@shared/schema";

interface Governorate {
  nameEn: string;
  nameAr: string;
  areas: { nameEn: string; nameAr: string }[];
}

const GOVERNORATES: Governorate[] = [
  {
    nameEn: "Al Ahmadi",
    nameAr: "Al Ahmadi",
    areas: [
      { nameEn: "Al Aḩmadī", nameAr: "Al Aḩmadī" },
      { nameEn: "Al Faḩāḩīl", nameAr: "Al Faḩāḩīl" },
      { nameEn: "Al Finţās", nameAr: "Al Finţās" },
      { nameEn: "Al Mahbūlah", nameAr: "Al Mahbūlah" },
      { nameEn: "Al Manqaf", nameAr: "Al Manqaf" },
      { nameEn: "Al Wafrah", nameAr: "Al Wafrah" },
      { nameEn: "Ar Riqqah", nameAr: "Ar Riqqah" },
    ],
  },
  {
    nameEn: "Al Asimah",
    nameAr: "Al Asimah",
    areas: [
      { nameEn: "Ad Dasmah", nameAr: "Ad Dasmah" },
      { nameEn: "Ar Rābiyah", nameAr: "Ar Rābiyah" },
      { nameEn: "Ash Shāmīyah", nameAr: "Ash Shāmīyah" },
      { nameEn: "Az Zawr", nameAr: "Az Zawr" },
      { nameEn: "Kuwait City", nameAr: "Kuwait City" },
    ],
  },
  {
    nameEn: "Al Farwaniyah",
    nameAr: "Al Farwaniyah",
    areas: [
      { nameEn: "Al Farwānīyah", nameAr: "Al Farwānīyah" },
      { nameEn: "Janūb as Surrah", nameAr: "Janūb as Surrah" },
    ],
  },
  {
    nameEn: "Al Jahra",
    nameAr: "Al Jahra",
    areas: [{ nameEn: "Al Jahrā’", nameAr: "Al Jahrā’" }],
  },
  {
    nameEn: "Hawalli",
    nameAr: "Hawalli",
    areas: [
      { nameEn: "Ar Rumaythīyah", nameAr: "Ar Rumaythīyah" },
      { nameEn: "As Sālimīyah", nameAr: "As Sālimīyah" },
      { nameEn: "Bayān", nameAr: "Bayān" },
      { nameEn: "Ḩawallī", nameAr: "Ḩawallī" },
      { nameEn: "Salwá", nameAr: "Salwá" },
    ],
  },
  {
    nameEn: "Mubarak Al-Kabeer",
    nameAr: "Mubarak Al-Kabeer",
    areas: [
      { nameEn: "Abu Al Hasaniya", nameAr: "Abu Al Hasaniya" },
      { nameEn: "Abu Fatira", nameAr: "Abu Fatira" },
      { nameEn: "Al Funayţīs", nameAr: "Al Funayţīs" },
      { nameEn: "Al-Masayel", nameAr: "Al-Masayel" },
      { nameEn: "Şabāḩ as Sālim", nameAr: "Şabāḩ as Sālim" },
    ],
  },
];

export async function seedCities() {
  const existing = await db.select().from(cities).limit(1);
  if (existing.length) return;

  for (const [gIndex, gov] of GOVERNORATES.entries()) {
    const [inserted] = await db
      .insert(cities)
      .values({
        nameEn: gov.nameEn,
        nameAr: gov.nameAr,
        type: "governorate",
        displayOrder: gIndex + 1,
      })
      .returning();

    for (const [aIndex, area] of gov.areas.entries()) {
      await db.insert(cities).values({
        nameEn: area.nameEn,
        nameAr: area.nameAr,
        type: "area",
        parentId: inserted.id,
        displayOrder: aIndex + 1,
      });
    }
  }
}

export default seedCities;

