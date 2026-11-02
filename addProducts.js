// Adds the Step Central catalogue: 15 products (5 per category) using only
// Nike / Adidas / ASICS / New Balance. Additive and idempotent — it never
// deletes existing products, and leaves images empty so real photos can be
// uploaded later from Admin → Update Product.
// seller is set to the brand (matches the existing New Balance / Adidas items).
// Run: node addProducts.js
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const connectDatabase = require('./config/database');
const Product = require('./models/product');

const products = [
    // ---------------- Running (5) ----------------
    { name: 'Nike Air Zoom Pegasus 41', brand: 'Nike', price: 7495, category: 'Running', stock: 30,
      description: 'Responsive React foam and Air Zoom cushioning for everyday training miles.' },
    { name: 'Adidas Ultraboost Light', brand: 'Adidas', price: 9995, category: 'Running', stock: 22,
      description: 'Light BOOST midsole and knit upper deliver energy-returning comfort run after run.' },
    { name: 'ASICS Gel-Kayano 31', brand: 'ASICS', price: 8995, category: 'Running', stock: 18,
      description: 'Stable support trainer with GEL cushioning and 4D GUIDANCE SYSTEM for overpronators.' },
    { name: 'New Balance Fresh Foam X 1080v13', brand: 'New Balance', price: 8495, category: 'Running', stock: 20,
      description: 'Plush Fresh Foam X midsole and engineered mesh for protective long-run comfort.' },
    { name: 'Nike ZoomX Invincible 3', brand: 'Nike', price: 9495, category: 'Running', stock: 15,
      description: 'Max-cushion ZoomX foam built for recovery days and easy, protected miles.' },

    // ---------------- Lifestyle (5) ----------------
    { name: 'Nike Air Force 1 \'07', brand: 'Nike', price: 5895, category: 'Lifestyle', stock: 40,
      description: 'The timeless court classic in crisp leather with supportive Air cushioning.' },
    { name: 'Adidas Samba OG', brand: 'Adidas', price: 5495, category: 'Lifestyle', stock: 35,
      description: 'Terrace icon with suede T-toe overlay, lace garage and grippy gum sole.' },
    { name: 'New Balance 550', brand: 'New Balance', price: 6295, category: 'Lifestyle', stock: 28,
      description: 'Retro hoops-inspired sneaker with clean leather overlays and vintage branding.' },
    { name: 'ASICS GEL-1130', brand: 'ASICS', price: 5995, category: 'Lifestyle', stock: 26,
      description: 'Y2K runner restyled for daily wear with visible GEL and breathable mesh panels.' },
    { name: 'Nike Dunk Low Retro', brand: 'Nike', price: 5795, category: 'Lifestyle', stock: 32,
      description: 'Low-profile hoops icon in crisp colorblocking that pairs with everything.' },

    // ---------------- Basketball (5) ----------------
    { name: 'Nike LeBron 22', brand: 'Nike', price: 12495, category: 'Basketball', stock: 12,
      description: 'Signature power shoe with Zoom Air and structured containment for explosive drives.' },
    { name: 'Adidas Harden Vol. 8', brand: 'Adidas', price: 10495, category: 'Basketball', stock: 16,
      description: 'Low, quick signature with Lightstrike cushioning for sharp crossovers and stops.' },
    { name: 'ASICS GELHOOP V17', brand: 'ASICS', price: 8495, category: 'Basketball', stock: 14,
      description: 'Court-ready hoop shoe with GEL cushioning and locked-in midfoot support.' },
    { name: 'New Balance KAWHI 4', brand: 'New Balance', price: 10995, category: 'Basketball', stock: 10,
      description: 'Kawhi Leonard signature with FuelCell cushioning for two-way stability and grip.' },
    { name: 'Nike KD 18', brand: 'Nike', price: 9995, category: 'Basketball', stock: 20,
      description: 'Versatile guard shoe with full-length Air and multidirectional traction for quick cuts.' },
];

(async () => {
    try {
        await connectDatabase();

        let created = 0, updated = 0, unchanged = 0;
        for (const p of products) {
            const existing = await Product.findOne({ name: p.name });
            if (existing) {
                // Correct seller -> brand without touching anything else (esp. images)
                if (existing.seller !== p.brand) {
                    existing.seller = p.brand;
                    await existing.save();
                    updated++;
                    console.log(`  ~ seller => ${p.brand} : ${p.name}`);
                } else {
                    unchanged++;
                    console.log(`  - ok (exists): ${p.name}`);
                }
                continue;
            }
            await Product.create({
                name: p.name,
                price: p.price,
                description: p.description,
                category: p.category,
                seller: p.brand,   // brand shown on the product page "Seller:" line
                stock: p.stock,
                images: [],        // photos uploaded later via Admin → Update Product
            });
            created++;
            console.log(`  + [${p.category.padEnd(10)}] ${p.name} — ₱${p.price} (${p.brand})`);
        }

        const total = await Product.countDocuments({});
        console.log(`\nDone. created=${created} updated=${updated} unchanged=${unchanged} | products in store=${total}`);
        process.exit(0);
    } catch (err) {
        console.error('addProducts failed:', err);
        process.exit(1);
    }
})();
