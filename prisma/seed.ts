// Local development data: two placeholder branches, sample stock and admin logins.
// Branch names, addresses and GSTINs are placeholders until the owners confirm them (PRD §14).
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Category, Condition, Era } from "../src/generated/prisma/enums";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

interface Seed {
  title: string;
  category: Category;
  era: Era;
  brand: string;
  condition: Condition;
  price: number; // rupees
  compareAt?: number;
  sizes: Record<string, number>; // size -> stock
  measurements: Record<string, number>;
  team?: string;
  season?: string;
  kitType?: string;
  authenticity?: string;
  playerPrint?: string;
  decade?: number;
  flaws?: string[];
  material?: string;
  colour?: string;
  tone: "a" | "b" | "c" | "d";
  branch: "IND" | "BAN";
  rack: string;
  tags?: string[];
  description: string;
}

const top = (chest: number, length: number, shoulder: number) => ({ chest, length, shoulder });
const jeans = (waist: number, inseam: number, rise: number, legOpening: number) => ({ waist, inseam, rise, legOpening });

const products: Seed[] = [
  { title: "Manchester United 1999 Home Jersey", category: "JERSEY", era: "RETRO", brand: "Umbro", team: "Manchester United", season: "1998/99", kitType: "Home", authenticity: "Authentic", decade: 1990, condition: "VERY_GOOD", price: 4499, sizes: { L: 1 }, measurements: top(58, 76, 50), flaws: ["Light pilling under the left arm", "Sponsor print slightly faded"], material: "Polyester", colour: "Red", tone: "b", branch: "IND", rack: "J-02", tags: ["90s football", "treble"], description: "The treble season shirt. Collar intact, crest stitched, original tags cut." },
  { title: "Brazil 2002 Home Jersey", category: "JERSEY", era: "RETRO", brand: "Nike", team: "Brazil", season: "2002", kitType: "Home", authenticity: "Replica", decade: 2000, condition: "EXCELLENT", price: 3799, sizes: { M: 1 }, measurements: top(54, 72, 46), material: "Polyester", colour: "Yellow", tone: "d", branch: "BAN", rack: "J-11", tags: ["world cup"], description: "World Cup winning year. Bright colour, no marks." },
  { title: "Chicago Bulls 1997 Jordan #23 Jersey", category: "JERSEY", era: "RETRO", brand: "Champion", team: "Chicago Bulls", season: "1996/97", kitType: "Away", authenticity: "Replica", playerPrint: "Jordan 23", decade: 1990, condition: "GOOD", price: 5299, sizes: { XL: 1 }, measurements: top(62, 80, 54), flaws: ["Small crack in the '2' of the back number", "Faint mark on hem"], material: "Mesh polyester", colour: "Red", tone: "a", branch: "IND", rack: "J-05", description: "Champion-made Bulls away jersey from the second three-peat." },
  { title: "India Cricket 2011 World Cup Jersey", category: "JERSEY", era: "RETRO", brand: "Nike", team: "India", season: "2011", kitType: "Home", authenticity: "Replica", decade: 2010, condition: "EXCELLENT", price: 2999, sizes: { M: 1 }, measurements: top(53, 73, 45), material: "Polyester", colour: "Blue", tone: "b", branch: "BAN", rack: "J-14", tags: ["cricket"], description: "The Wankhede final shirt. Clean with sharp colours." },
  { title: "AC Milan 2006/07 Away Jersey", category: "JERSEY", era: "RETRO", brand: "Adidas", team: "AC Milan", season: "2006/07", kitType: "Away", authenticity: "Authentic", decade: 2000, condition: "VERY_GOOD", price: 3999, sizes: { L: 1 }, measurements: top(56, 74, 48), flaws: ["Tiny pull on the right sleeve"], material: "Polyester", colour: "White", tone: "d", branch: "IND", rack: "J-03", tags: ["90s football"], description: "Champions League winning season away shirt." },
  { title: "Real Madrid 2025/26 Home Jersey", category: "JERSEY", era: "LATEST", brand: "Adidas", team: "Real Madrid", season: "2025/26", kitType: "Home", authenticity: "Replica", decade: 2020, condition: "NEW", price: 2799, compareAt: 5999, sizes: { S: 1, M: 2, L: 2, XL: 1 }, measurements: top(54, 72, 46), material: "Recycled polyester", colour: "White", tone: "d", branch: "BAN", rack: "L-01", description: "Current season home shirt, tags on. Measurements are for size M." },
  { title: "Nirvana 1992 Smiley Tour Tee", category: "TSHIRT", era: "RETRO", brand: "Giant", decade: 1990, condition: "GOOD", price: 6499, sizes: { L: 1 }, measurements: top(56, 71, 52), flaws: ["Cracked print, as expected for age", "Small hole near collar seam, photographed"], material: "Cotton", colour: "Black", tone: "a", branch: "IND", rack: "T-01", tags: ["band tees"], description: "Single-stitch band tee on a Giant blank. Soft, boxy, properly faded." },
  { title: "Metallica 1994 Tour Tee", category: "TSHIRT", era: "RETRO", brand: "Brockum", decade: 1990, condition: "VERY_GOOD", price: 5499, sizes: { XL: 1 }, measurements: top(60, 74, 55), flaws: ["Light fading on back print"], material: "Cotton", colour: "Black", tone: "a", branch: "BAN", rack: "T-07", tags: ["band tees"], description: "Brockum-printed tour tee with back dates." },
  { title: "Harley-Davidson 1988 Eagle Tee", category: "TSHIRT", era: "RETRO", brand: "Harley-Davidson", decade: 1980, condition: "VERY_GOOD", price: 3999, sizes: { M: 1 }, measurements: top(52, 69, 47), flaws: ["Slight yellowing at the underarm"], material: "Cotton blend", colour: "Grey", tone: "c", branch: "IND", rack: "T-04", description: "Paper-thin 50/50 dealer tee." },
  { title: "Nike 1996 Swoosh Grey Tag Tee", category: "TSHIRT", era: "RETRO", brand: "Nike", decade: 1990, condition: "EXCELLENT", price: 2499, sizes: { L: 1 }, measurements: top(57, 73, 51), material: "Cotton", colour: "White", tone: "d", branch: "BAN", rack: "T-09", description: "Grey-tag era centre swoosh. Clean white, no stains." },
  { title: "Stüssy Stock Logo Tee", category: "TSHIRT", era: "LATEST", brand: "Stüssy", decade: 2020, condition: "LIKE_NEW", price: 2299, compareAt: 4499, sizes: { M: 1, L: 1 }, measurements: top(55, 72, 50), material: "Cotton", colour: "Black", tone: "a", branch: "IND", rack: "L-05", description: "Current-season stock logo, worn once." },
  { title: "Heavyweight Boxy Plain Tee", category: "TSHIRT", era: "LATEST", brand: "Bonkers Corner", decade: 2020, condition: "NEW", price: 899, sizes: { S: 3, M: 4, L: 4, XL: 2 }, measurements: top(58, 70, 54), material: "240 GSM cotton", colour: "Off-white", tone: "d", branch: "BAN", rack: "L-08", description: "240 GSM boxy fit. Measurements are for size M." },
  { title: "Graphic Oversized Tee", category: "TSHIRT", era: "LATEST", brand: "H&M", decade: 2020, condition: "NEW", price: 799, sizes: { M: 2, L: 2 }, measurements: top(60, 73, 56), material: "Cotton", colour: "Washed black", tone: "b", branch: "IND", rack: "L-09", description: "Oversized fit with a back graphic. Measurements are for size M." },
  { title: "Levi's 501 1990s Made in USA", category: "JEANS", era: "RETRO", brand: "Levi's", decade: 1990, condition: "VERY_GOOD", price: 4999, sizes: { "32": 1 }, measurements: jeans(81, 79, 29, 20), flaws: ["Natural fading at knees", "Hem slightly frayed"], material: "Cotton denim", colour: "Mid wash", tone: "b", branch: "IND", rack: "D-01", tags: ["selvedge denim"], description: "Button fly, straight leg. Tag says 32×32; measured waist below." },
  { title: "Wrangler 13MWZ Bootcut 1980s", category: "JEANS", era: "RETRO", brand: "Wrangler", decade: 1980, condition: "GOOD", price: 3499, sizes: { "34": 1 }, measurements: jeans(86, 81, 30, 24), flaws: ["Small repair on back pocket", "Light mark on left thigh"], material: "Cotton denim", colour: "Dark wash", tone: "a", branch: "BAN", rack: "D-04", description: "Cowboy-cut bootcut with a proper vintage fade." },
  { title: "Lee Rider High-Rise 1970s", category: "JEANS", era: "RETRO", brand: "Lee", decade: 1970, condition: "VERY_GOOD", price: 5799, sizes: { "28": 1 }, measurements: jeans(71, 76, 31, 19), material: "Cotton denim", colour: "Light wash", tone: "c", branch: "IND", rack: "D-02", description: "High-rise, tapered leg. Rare in this size." },
  { title: "Momotaro Selvedge Straight", category: "JEANS", era: "RETRO", brand: "Momotaro", decade: 2010, condition: "EXCELLENT", price: 8999, sizes: { "33": 1 }, measurements: jeans(84, 82, 28, 20), material: "15.7 oz selvedge denim", colour: "Indigo", tone: "a", branch: "BAN", rack: "D-06", tags: ["selvedge denim"], description: "Japanese selvedge, lightly worn with a crisp chain-stitch hem." },
  { title: "Baggy Carpenter Jeans", category: "JEANS", era: "LATEST", brand: "Zara", decade: 2020, condition: "NEW", price: 1999, compareAt: 3590, sizes: { "30": 2, "32": 2, "34": 1 }, measurements: jeans(78, 80, 32, 26), material: "Cotton denim", colour: "Light blue", tone: "c", branch: "IND", rack: "L-12", description: "Current baggy carpenter fit. Measurements are for size 30." },
  { title: "Relaxed Cargo Denim", category: "JEANS", era: "LATEST", brand: "Uniqlo", decade: 2020, condition: "LIKE_NEW", price: 1799, sizes: { "32": 1 }, measurements: jeans(82, 78, 30, 23), material: "Cotton denim", colour: "Black", tone: "a", branch: "BAN", rack: "L-14", description: "Relaxed cargo cut, worn twice." },
  { title: "Slim Tapered Stretch Jeans", category: "JEANS", era: "LATEST", brand: "Levi's", decade: 2020, condition: "NEW", price: 2499, compareAt: 3999, sizes: { "30": 2, "32": 3, "34": 2 }, measurements: jeans(80, 81, 26, 16), material: "Stretch denim", colour: "Dark indigo", tone: "b", branch: "IND", rack: "L-15", description: "512 slim taper. Measurements are for size 32." },
];

function slugify(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function imagesFor(p: Seed) {
  const kind = p.category === "TSHIRT" ? "tee" : p.category === "JEANS" ? "jeans" : "jersey";
  return [
    `/placeholders/${kind}-${p.tone}-front.svg`,
    `/placeholders/${kind}-${p.tone}-back.svg`,
    "/placeholders/tag.svg",
    "/placeholders/detail.svg",
  ];
}

async function main() {
  const branches = {
    IND: await db.branch.upsert({
      where: { code: "IND" },
      update: { state: "Karnataka" },
      create: {
        code: "IND",
        name: "Indiranagar",
        address: "100 Feet Road, HAL 2nd Stage, Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
        phone: "+91 80000 00001",
        hours: "Mon–Sun, 11 am – 9 pm",
        mapUrl: "https://maps.google.com/?q=Indiranagar+Bengaluru",
        gstin: null,
      },
    }),
    BAN: await db.branch.upsert({
      where: { code: "BAN" },
      update: { state: "Maharashtra" },
      create: {
        code: "BAN",
        name: "Bandra West",
        address: "Hill Road, Bandra West",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400050",
        phone: "+91 80000 00002",
        hours: "Mon–Sun, 11 am – 9 pm",
        mapUrl: "https://maps.google.com/?q=Hill+Road+Bandra",
        gstin: null,
      },
    }),
  };

  const now = Date.now();
  for (const [i, p] of products.entries()) {
    const slug = slugify(p.title);
    const images = imagesFor(p);
    await db.product.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        sku: `${p.branch}-${String(1001 + i)}`,
        branchId: branches[p.branch].id,
        title: p.title,
        description: p.description,
        category: p.category,
        era: p.era,
        brand: p.brand,
        team: p.team,
        season: p.season,
        kitType: p.kitType,
        authenticity: p.authenticity,
        playerPrint: p.playerPrint,
        decade: p.decade,
        condition: p.condition,
        flaws: p.flaws ?? [],
        measurements: p.measurements,
        material: p.material,
        colour: p.colour,
        pricePaise: p.price * 100,
        compareAtPaise: p.compareAt ? p.compareAt * 100 : null,
        status: "PUBLISHED",
        rackLocation: p.rack,
        tags: p.tags ?? [],
        // Stagger so "Just landed" has an order.
        publishedAt: new Date(now - i * 3_600_000),
        variants: { create: Object.entries(p.sizes).map(([size, stockQty]) => ({ size, stockQty })) },
        images: { create: images.map((url, position) => ({ url, position, altText: `${p.title}, photo ${position + 1}` })) },
      },
    });
  }

  const password = process.env.SEED_ADMIN_PASSWORD ?? "thrift-dev-123";
  const hash = await bcrypt.hash(password, 12);
  const admins = [
    { email: "owner@thriftsyndicate.local", name: "Owner", role: "SUPER_ADMIN" as const, branchId: null },
    { email: "indiranagar@thriftsyndicate.local", name: "Indiranagar staff", role: "BRANCH_ADMIN" as const, branchId: branches.IND.id },
    { email: "bandra@thriftsyndicate.local", name: "Bandra staff", role: "BRANCH_ADMIN" as const, branchId: branches.BAN.id },
  ];
  for (const a of admins) {
    await db.adminUser.upsert({ where: { email: a.email }, update: {}, create: { ...a, passwordHash: hash } });
  }

  console.log(`Seeded ${products.length} products, 2 branches, ${admins.length} admins.`);
  console.log(`Admin logins (password "${password}"): ${admins.map((a) => a.email).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
