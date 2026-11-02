// One-off data fix: negative stock came from historical test orders created
// before stock-restore existed. Clamp the 6 seeded products back to seed values
// and any other product to 0 minimum.
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const dns = require('dns');

const SEED_STOCK = {
    'AeroRun Pro': 25,
    'Sprint Fly 2': 18,
    'Court King AJ': 12,
    'Dunk Force High': 9,
    'Urban Classic 77': 40,
    'Retro Slip-On': 33,
};

(async () => {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    await mongoose.connect(process.env.DB_URI);
    const db = mongoose.connection.db;

    let fixed = 0;
    for (const [name, stock] of Object.entries(SEED_STOCK)) {
        const res = await db.collection('products').updateMany(
            { name, stock: { $lt: 0 } },
            { $set: { stock } }
        );
        fixed += res.modifiedCount;
    }
    // Any other product with negative stock -> 0
    const res = await db.collection('products').updateMany(
        { stock: { $lt: 0 } },
        { $set: { stock: 0 } }
    );
    fixed += res.modifiedCount;

    const still = await db.collection('products').countDocuments({ stock: { $lt: 0 } });
    console.log(`Fixed ${fixed} product(s). Products still negative: ${still}`);
    process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
