import { db } from "./db";
import { cities } from "@shared/schema";

interface Governorate {
  nameEn: string;
  nameAr: string;
  areas: { nameEn: string; nameAr: string }[];
}

const GOVERNORATES: Governorate[] = [
  {
    nameEn: "Al Asimah",
    nameAr: "العاصمة",
    areas: [
      { nameEn: "Abdulla Al-Salem", nameAr: "ضاحية عبد الله السالم" },
      { nameEn: "Adailiya", nameAr: "العديلية" },
      { nameEn: "Al-Sour Gardens", nameAr: "حدائق السور" },
      { nameEn: "Bnaid Al-Qar", nameAr: "بنيد القار" },
      { nameEn: "Daiya", nameAr: "الدعية" },
      { nameEn: "Dasma", nameAr: "الدسمة" },
      { nameEn: "Doha", nameAr: "الدوحة" },
      { nameEn: "Doha Port", nameAr: "ميناء الدوحة" },
      { nameEn: "Faiha", nameAr: "الفيحاء" },
      { nameEn: "Failaka Island", nameAr: "فيلكا" },
      { nameEn: "Granada", nameAr: "غرناطة" },
      { nameEn: "Jibla", nameAr: "جِبْلَة" },
      { nameEn: "Kaifan", nameAr: "كيفان" },
      { nameEn: "Khaldiya", nameAr: "الخالدية" },
      { nameEn: "Mansouriya", nameAr: "المنصورية" },
      { nameEn: "Mirqab", nameAr: "المرقاب" },
      { nameEn: "Nahdha", nameAr: "النهضة" },
      { nameEn: "North West Sulaibikhat", nameAr: "شمال غرب الصليبيخات" },
      { nameEn: "Nuzha", nameAr: "النزهة" },
      { nameEn: "Qadsiya", nameAr: "القادسية" },
      { nameEn: "Qortuba", nameAr: "قرطبة" },
      { nameEn: "Rawda", nameAr: "الروضة" },
      { nameEn: "Shamiya", nameAr: "الشامية" },
      { nameEn: "Sharq", nameAr: "شرق" },
      { nameEn: "Shuwaikh", nameAr: "الشويخ" },
      { nameEn: "Shuwaikh Industrial Area", nameAr: "الشويخ الصناعية" },
      { nameEn: "Shuwaikh Port", nameAr: "ميناء الشويخ" },
      { nameEn: "Sulaibikhat", nameAr: "الصليبخات" },
      { nameEn: "Qairawan", nameAr: "القيروان" },
      { nameEn: "Surra", nameAr: "السرة" },
      { nameEn: "Ouha Island", nameAr: "جزيرة أوها" },
      { nameEn: "Mischan Island", nameAr: "جزيرة ميشان" },
      { nameEn: "Umm an Namil Island", nameAr: "جزيرة ام النمل" },
      { nameEn: "Yarmouk", nameAr: "اليرموك" },
    ],
  },
  {
    nameEn: "Hawalli",
    nameAr: "حولي",
    areas: [
      { nameEn: "Bayan", nameAr: "بيان" },
      { nameEn: "Jabriya", nameAr: "الجابرية" },
      { nameEn: "Rumaithiya", nameAr: "الرميثية" },
      { nameEn: "Salam", nameAr: "سلام" },
      { nameEn: "Salwa", nameAr: "سلوى" },
      { nameEn: "Al- Bida'a", nameAr: "البدع" },
      { nameEn: "Anjafa", nameAr: "أنجفة" },
      { nameEn: "Hawalli", nameAr: "حولي" },
      { nameEn: "Hitteen", nameAr: "حطين" },
      { nameEn: "Mishrif", nameAr: "مشرف" },
      { nameEn: "Mubarak Al-Abdullah", nameAr: "مبارك العبدالله" },
      { nameEn: "Salmiya", nameAr: "السالمية" },
      { nameEn: "Shaab", nameAr: "الشعب" },
      { nameEn: "Shuhada", nameAr: "الشهداء" },
      { nameEn: "Al-Siddiq", nameAr: "الصديق" },
      { nameEn: "Ministries Area", nameAr: "منطقة الوزارات" },
      { nameEn: "Zahra", nameAr: "الزهراء" },
    ],
  },
  {
    nameEn: "Mubarak Al-Kabeer",
    nameAr: "مبارك الكبير",
    areas: [
      { nameEn: "Abu Al Hasaniya", nameAr: "أبو الحصانية" },
      { nameEn: "Abu Ftaira", nameAr: "أبو فطيرة" },
      { nameEn: "Al-Adan", nameAr: "العدان" },
      { nameEn: "Al Qurain", nameAr: "القرين" },
      { nameEn: "Al-Qusour", nameAr: "القصور" },
      { nameEn: "Al-Fnaitees", nameAr: "الفنيطيس" },
      { nameEn: "Messila", nameAr: "المسيلة" },
      { nameEn: "Al-Masayel", nameAr: "المسايل" },
      { nameEn: "Mubarak Al-Kabeer", nameAr: "مبارك الكبير" },
      { nameEn: "Sabah Al-Salem", nameAr: "صباح السالم" },
      { nameEn: "Subhan Industrial", nameAr: "صبحان" },
      { nameEn: "Wista", nameAr: "وسطي" },
      { nameEn: "West Abu Ftaira Herafiya", nameAr: "غرب ابو فطيرة حرفية" },
    ],
  },
  {
    nameEn: "Al Ahmadi",
    nameAr: "الأحمدي",
    areas: [
      { nameEn: "Abu Halifa", nameAr: "أبو حليفة" },
      { nameEn: "Mina Abdulla", nameAr: "ميناء عبد الله" },
      { nameEn: "Ahmadi", nameAr: "الأحمدي" },
      { nameEn: "Ali Sabah Al-Salem", nameAr: "علي صباح السالم" },
      { nameEn: "Egaila", nameAr: "العقيلة" },
      { nameEn: "Bar Al-Ahmadi", nameAr: "بر الأحمدي" },
      { nameEn: "Bnaider", nameAr: "بنيدر" },
      { nameEn: "Dhaher", nameAr: "الظهر" },
      { nameEn: "Fahaheel", nameAr: "الفحيحيل" },
      { nameEn: "Fahad Al-Ahmad", nameAr: "فهد الأحمد" },
      { nameEn: "Hadiya", nameAr: "هدية" },
      { nameEn: "Jaber Al-Ali", nameAr: "جابر العلي" },
      { nameEn: "Al-Julaia'a", nameAr: "الجليعة" },
      { nameEn: "Khairan", nameAr: "الخيران" },
      { nameEn: "Mahboula", nameAr: "المهبولة" },
      { nameEn: "Mangaf", nameAr: "المنقف" },
      { nameEn: "Magwa", nameAr: "المقوع" },
      { nameEn: "Wafra Residential", nameAr: "وفرة السكنية" },
      { nameEn: "Al-Nuwaiseeb", nameAr: "النويصيب" },
      { nameEn: "Riqqa", nameAr: "الرقة" },
      { nameEn: "Sabah Al Ahmad", nameAr: "صباح الاحمد" },
      { nameEn: "Sabah Al Ahmad Sea City", nameAr: "مدينة صباح الأحمد البحرية" },
      { nameEn: "Sabahiya", nameAr: "الصباحية" },
      { nameEn: "Shuaiba Industrial", nameAr: "الشعيبة" },
      { nameEn: "South Sabahiya", nameAr: "جنوب الصباحية" },
      { nameEn: "Wafra", nameAr: "الوفرة" },
      { nameEn: "Zoor", nameAr: "الزور" },
      { nameEn: "Fintas", nameAr: "الفنطاس" },
      { nameEn: "Al Shadadiya Industrial", nameAr: "الشدادية الصناعية" },
    ],
  },
  {
    nameEn: "Al Farwaniyah",
    nameAr: "الفروانية",
    areas: [
      { nameEn: "Abdullah Al-Mubarak", nameAr: "عبدالله المبارك" },
      { nameEn: "Airport District", nameAr: "منطقة المطار" },
      { nameEn: "Andalus", nameAr: "الأندلس" },
      { nameEn: "Ardiya", nameAr: "العارضية" },
      { nameEn: "Ardiya Herafiya", nameAr: "العارضية حرفية" },
      { nameEn: "Ishbiliya", nameAr: "اشبيلية" },
      { nameEn: "Al-Dajeej", nameAr: "الضجيج" },
      { nameEn: "Farwaniya", nameAr: "الفروانية" },
      { nameEn: "Ferdous", nameAr: "الفردوس" },
      { nameEn: "Jleeb Al-Shuyoukh", nameAr: "جليب الشيوخ" },
      { nameEn: "Khaitan", nameAr: "خيطان" },
      { nameEn: "Omariya", nameAr: "العمرية" },
      { nameEn: "Rabiya", nameAr: "الرابية" },
      { nameEn: "Al-Rai", nameAr: "الري" },
      { nameEn: "Al-Riggai", nameAr: "الرقعي" },
      { nameEn: "Rehab", nameAr: "الرحاب" },
      { nameEn: "Sabah Al-Nasser", nameAr: "صباح الناصر" },
      { nameEn: "Sabah Al-Salem University", nameAr: "جامعة صباح السالم" },
      { nameEn: "West Abdullah Al-Mubarak", nameAr: "غرب عبدالله المبارك" },
      { nameEn: "South Abdullah Al-Mubarak", nameAr: "جنوب عبدالله المبارك" },
      { nameEn: "Sulaibiya Industrial", nameAr: "الصليبية الصناعية" },
    ],
  },
  {
    nameEn: "Al Jahra",
    nameAr: "الجهراء",
    areas: [
      { nameEn: "Abdali", nameAr: "العبدلي" },
      { nameEn: "Al-Mutlaa", nameAr: "المطلاع" },
      { nameEn: "Kazma", nameAr: "كازما" },
      { nameEn: "Bahra", nameAr: "بحرة" },
      { nameEn: "Kabd", nameAr: "كبد" },
      { nameEn: "Al-Sheqaya", nameAr: "الشقايه" },
      { nameEn: "Al-Nahda", nameAr: "النهضة" },
      { nameEn: "Amghara Industrial", nameAr: "أمغرة" },
      { nameEn: "Bar Al-Jahra", nameAr: "بر الجهراء" },
      { nameEn: "Jahra", nameAr: "الجهراء" },
      { nameEn: "Jahra Industrial Herafiya", nameAr: "الجهراء الصناعية الحرفية" },
      { nameEn: "Naeem", nameAr: "النعيم" },
      { nameEn: "Nasseem", nameAr: "النسيم" },
      { nameEn: "Oyoun", nameAr: "العيون" },
      { nameEn: "Qasr", nameAr: "القصر" },
      { nameEn: "Jaber Al-Ahmad", nameAr: "جابر الأحمد" },
      { nameEn: "Saad Al Abdullah", nameAr: "سعد العبدالله" },
      { nameEn: "Salmi", nameAr: "السالمي" },
      { nameEn: "Subiya", nameAr: "الصبية" },
      { nameEn: "Sulaibiya", nameAr: "الصليبية" },
      { nameEn: "Sulaibiya Agricultural Area", nameAr: "الصليبية الزراعية" },
      { nameEn: "Sulaibiya Residential", nameAr: "الصليبية السكنية" },
      { nameEn: "Taima", nameAr: "تيماء" },
      { nameEn: "Waha", nameAr: "الواحة" },
      { nameEn: "Bubiyan Island", nameAr: "جزيرة بوبيان" },
      { nameEn: "Warbah Island", nameAr: "جزيرة وربة" },
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
