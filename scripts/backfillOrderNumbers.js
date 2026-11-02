// One-time script: assign sequential orderNumber (1, 2, 3, ...) to existing orders
// Run:  node scripts/backfillOrderNumbers.js
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const dns = require('dns');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Same DNS fix as backend/config/database.js (Windows sometimes blocks Node's default resolver for SRV lookups)
const ensureDnsWorks = () => new Promise((resolve) => {
    dns.resolveSrv('_mongodb._tcp.' + (process.env.DB_URI.match(/@([^/]+)\//) || [])[1], (err) => {
        if (err) dns.setServers(['8.8.8.8', '1.1.1.1']);
        resolve();
    });
});

const Order = require('../models/order');

async function run() {
    await ensureDnsWorks();
    await mongoose.connect(process.env.DB_URI || process.env.DATABASE);

    // Start from the highest existing number (so re-runs don't duplicate)
    const last = await Order.findOne({ orderNumber: { $ne: null } })
        .sort({ orderNumber: -1 })
        .select('orderNumber');
    let counter = last ? last.orderNumber : 0;

    const missing = await Order.find({ $or: [{ orderNumber: null }, { orderNumber: { $exists: false } }] })
        .sort({ createdAt: 1 })
        .select('_id');

    for (const order of missing) {
        counter += 1;
        await Order.updateOne({ _id: order._id }, { $set: { orderNumber: counter } });
        console.log(`Order ${order._id} -> #${counter}`);
    }

    const total = await Order.countDocuments();
    console.log(`Done. Backfilled ${missing.length} order(s); ${total} total orders.`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
