// One-time cleanup: remove seeded users, reviews, and orders (keeps the admin).
// Run:  node scripts/cleanupSeededData.js
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const dns = require('dns');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Same DNS fix as backend/config/database.js
const ensureDnsWorks = () => new Promise((resolve) => {
    dns.resolveSrv('_mongodb._tcp.' + (process.env.DB_URI.match(/@([^/]+)\//) || [])[1], (err) => {
        if (err) dns.setServers(['8.8.8.8', '1.1.1.1']);
        resolve();
    });
});

const Order = require('../models/order');
const Product = require('../models/product');
const User = require('../models/user');

async function run() {
    await ensureDnsWorks();
    await mongoose.connect(process.env.DB_URI || process.env.DATABASE);

    // 1. Delete all orders (and their line items via cascade-safe deleteMany on headers;
    //    OrderDetail rows referencing them can be removed by orderId lookup).
    const orders = await Order.deleteMany({});
    console.log(`Deleted ${orders.deletedCount} order(s).`);

    const OrderDetail = require('../models/orderDetail');
    const details = await OrderDetail.deleteMany({});
    console.log(`Deleted ${details.deletedCount} order detail(s).`);

    // 2. Clear all product reviews + reset rating aggregates.
    const products = await Product.updateMany({}, { $set: { reviews: [], numOfReviews: 0, ratings: 0 } });
    console.log(`Cleared reviews on ${products.modifiedCount} product(s).`);

    // 3. Delete seeded users except the main admin.
    const users = await User.deleteMany({ email: { $ne: 'admin@stepcentral.com' } });
    console.log(`Deleted ${users.deletedCount} user(s) (kept admin@stepcentral.com).`);

    console.log('Cleanup complete!');
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
