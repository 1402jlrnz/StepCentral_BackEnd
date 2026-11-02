// One-time migration: move legacy embedded order.orderItems into the
// normalized `orderdetails` collection (PrestigePerf-style order_details).
// Safe to run multiple times — skips orders that already have details.
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const dns = require('dns');

(async () => {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    await mongoose.connect(process.env.DB_URI);
    const db = mongoose.connection.db;
    console.log('Connected. Migrating embedded orderItems -> orderdetails ...');

    const legacy = await db.collection('orders')
        .find({ orderItems: { $exists: true, $ne: [] } })
        .project({ orderItems: 1 })
        .toArray();

    let migrated = 0;
    for (const order of legacy) {
        const already = await db.collection('orderdetails').countDocuments({ orderId: order._id });
        if (already > 0) {
            // Already migrated — just strip the legacy embedded array
            await db.collection('orders').updateOne({ _id: order._id }, { $unset: { orderItems: '' } });
            continue;
        }
        const docs = order.orderItems.map(item => ({
            orderId: order._id,
            product: item.product,
            name: item.name,
            image: item.image,
            quantity: item.quantity,
            price: item.price,
        }));
        await db.collection('orderdetails').insertMany(docs);
        await db.collection('orders').updateOne({ _id: order._id }, { $unset: { orderItems: '' } });
        migrated++;
    }

    const remaining = await db.collection('orders').countDocuments({ orderItems: { $exists: true } });
    console.log(`Migrated ${migrated} order(s). Legacy embedded arrays remaining: ${remaining}`);
    process.exit(0);
})().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
