// Seeds demo/test data: 3 test users, realistic product reviews, and a delivered order.
// Run: node scripts/seedTestData.js   (or: npm run seed:test)
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

const User = require('../models/user');
const Product = require('../models/product');
const Order = require('../models/order');
const OrderDetail = require('../models/orderDetail');

// Test accounts (password for all: test1234)
const TEST_USERS = [
    { name: 'Alice Reyes', email: 'alice@test.com', password: 'test1234' },
    { name: 'Bob Lim', email: 'bob@test.com', password: 'test1234' },
    { name: 'Carol Santos', email: 'carol@test.com', password: 'test1234' },
];

// Fake Cloudinary-hosted avatars (no real upload needed for seed users)
const testAvatar = (slug) => ({
    public_id: `testusers/${slug}`,
    url: `https://res.cloudinary.com/demo/image/upload/v1234567890/avatars/${slug}.png`,
});

// Real-ish reviews: [product name, reviews[]]
const REVIEW_SEEDS = [
    {
        product: 'AeroRun Pro',
        reviews: [
            {
                user: 'alice@test.com',
                name: 'Alice Reyes',
                rating: 5,
                comment: 'Ran my first 10K in these and shaved four minutes off my PR. The responsive cushioning returns energy instantly and I had zero leg soreness the next day.',
            },
            {
                user: 'bob@test.com',
                name: 'Bob Lim',
                rating: 4,
                comment: 'Great daily trainer overall, though the engineered mesh runs snug if you swap socks mid-sneak. Comfort kicks in after about a week of breaking in.',
            },
        ],
    },
    {
        product: 'Sprint Fly 2',
        reviews: [
            {
                user: 'carol@test.com',
                name: 'Carol Santos',
                rating: 5,
                comment: 'Race day experience on a sub-3 hour half marathon. The carbon plate gave me that final push without any wobble on the turns.',
            },
        ],
    },
    {
        product: 'Court King AJ',
        reviews: [
            {
                user: 'bob@test.com',
                name: 'Bob Lim',
                rating: 5,
                comment: 'Lockdown support is no joke — my usual hesitation on crossovers is gone. Traction on dusty courts is solid too, no slipping on hard cuts.',
            },
            {
                user: 'alice@test.com',
                name: 'Alice Reyes',
                rating: 4,
                comment: 'Plush cushioning for long playoff games. Wish the midsole was a bit firmer for sharp defensive slides, but for comfort running it is top tier.',
            },
        ],
    },
    {
        product: 'Urban Classic 77',
        reviews: [
            {
                user: 'carol@test.com',
                name: 'Carol Santos',
                rating: 5,
                comment: 'Retro silhouette with modern comfort. Wore it to two weddings and still got asked where I got them. Looks better with age, honestly.',
            },
            {
                user: 'bob@test.com',
                name: 'Bob Lim',
                rating: 3,
                comment: 'Good everyday shoe but the sole wore down faster than I expected after a month of daily wear. Not bad, just not a forever shoe.',
            },
        ],
    },
];

// Sample products (same list as the main seeder; created here only if missing)
const SAMPLE_PRODUCTS = [
    { name: 'AeroRun Pro', price: 129.99, category: 'Running', stock: 25, seller: 'Step Central Official', description: 'Lightweight running shoe with responsive cushioning for daily miles.' },
    { name: 'Sprint Fly 2', price: 99.5, category: 'Running', stock: 18, seller: 'Step Central Official', description: 'Breathable mesh runner built for speed work and race day.' },
    { name: 'Court King AJ', price: 189.99, category: 'Basketball', stock: 12, seller: 'Step Central Official', description: 'High-top basketball shoe with lockdown support and Air cushioning.' },
    { name: 'Dunk Force High', price: 149.0, category: 'Basketball', stock: 9, seller: 'Step Central Official', description: 'Court-ready high tops with durable traction for hard cuts.' },
    { name: 'Urban Classic 77', price: 79.99, category: 'Lifestyle', stock: 40, seller: 'Step Central Official', description: 'Retro everyday sneaker that goes with anything in your closet.' },
    { name: 'Retro Slip-On', price: 59.95, category: 'Lifestyle', stock: 33, seller: 'Step Central Official', description: 'Easy slip-on lifestyle shoe with all-day comfort.' },
];

const ensureProducts = async () => {
    for (const p of SAMPLE_PRODUCTS) {
        const existing = await Product.findOne({ name: p.name });
        if (existing) continue;
        await Product.create({
            name: p.name,
            price: p.price,
            description: p.description,
            category: p.category,
            seller: p.seller,
            stock: p.stock,
            images: [{ public_id: `external/${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, url: `https://res.cloudinary.com/demo/image/upload/v1234567890/products/${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg` }],
        });
        console.log(`  ✔ Product created: ${p.name}`);
    }
};

const run = async () => {
    await ensureDnsWorks();
    await mongoose.connect(process.env.DB_URI || process.env.DATABASE);

    console.log('Seeding test data...');

    // Make sure the sample products exist so reviews + order have something to attach to
    await ensureProducts();

    // 1. Create the 3 test users (skip silently if already exist)
    const usersByEmail = {};
    for (const t of TEST_USERS) {
        let user = await User.findOne({ email: t.email });
        if (!user) {
            user = await User.create({
                name: t.name,
                email: t.email,
                password: t.password,
                avatar: testAvatar(t.email.split('@')[0]),
                role: 'user',
            });
            console.log(`  ✔ User created: ${t.email} (password: ${t.password})`);
        } else {
            console.log(`  - User exists, skipping: ${t.email}`);
        }
        usersByEmail[t.email] = user;
    }

    const alice = usersByEmail['alice@test.com'];

    // 2. Clear previous test orders for these users, then re-create the demo order
    const testUserIds = Object.values(usersByEmail).map(u => u._id);
    const oldOrders = await Order.find({ user: { $in: testUserIds } });
    for (const o of oldOrders) {
        await OrderDetail.deleteMany({ orderId: o._id });
    }
    const deletedOrders = await Order.deleteMany({ user: { $in: testUserIds } });
    if (deletedOrders.deletedCount > 0) {
        console.log(`  - Cleared ${deletedOrders.deletedCount} old test order(s).`);
    }

    // 3. Add realistic reviews for seeded products
    const products = await Product.find({});
    const productByName = {};
    for (const p of products) productByName[p.name] = p;

    for (const seed of REVIEW_SEEDS) {
        const product = await Product.findOne({ name: seed.product });
        if (!product) {
            console.log(`  ! Product not found, skipping reviews for: ${seed.product}`);
            continue;
        }

        const reviews = [];
        for (const r of seed.reviews) {
            const user = usersByEmail[r.user];
            if (user) {
                reviews.push({
                    user: user._id,
                    name: user.name,
                    rating: r.rating,
                    comment: r.comment,
                });
            }
        }

        product.reviews = reviews;
        product.numOfReviews = reviews.length;
        product.ratings = reviews.length > 0
            ? reviews.reduce((acc, r) => r.rating + acc, 0) / reviews.length
            : 0;
        await product.save({ validateBeforeSave: false });
        console.log(`  ✔ Reviews set on ${seed.product}: ${reviews.length} review(s), avg rating ${product.ratings.toFixed(1)}`);
    }

    // 4. Create a delivered order for each test user on the product they reviewed
    const ordersToSeed = [
        { userEmail: 'alice@test.com', productName: 'AeroRun Pro', quantity: 1 },
        { userEmail: 'bob@test.com', productName: 'Court King AJ', quantity: 1 },
        { userEmail: 'carol@test.com', productName: 'Sprint Fly 2', quantity: 1 },
    ];
    for (const o of ordersToSeed) {
        const user = usersByEmail[o.userEmail];
        const product = await Product.findOne({ name: o.productName });
        if (!user || !product) continue;

        const lastOrder = await Order.findOne().sort({ orderNumber: -1 }).select('orderNumber');
        const orderNumber = lastOrder && lastOrder.orderNumber ? lastOrder.orderNumber + 1 : 1;
        const subtotal = product.price * o.quantity;
        const shipping = subtotal > 200 ? 0 : 25;
        const tax = Number((0.05 * subtotal).toFixed(2));

        const order = await Order.create({
            orderNumber,
            shippingInfo: {
                address: '789 Test Street',
                city: 'Manila',
                phoneNo: '09171234567',
                postalCode: '1000',
                country: 'Philippines',
            },
            user: user._id,
            itemsPrice: subtotal,
            taxPrice: tax,
            shippingPrice: shipping,
            totalPrice: Number((subtotal + shipping + tax).toFixed(2)),
            paymentInfo: { id: 'GCASH_SEED_8391027', status: 'succeeded', method: 'GCash', reference: 'GCASHSEED8391027' },
            paidAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
            orderStatus: 'Delivered',
            deliveredAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12),
            dateReceived: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12),
        });

        await OrderDetail.insertMany([{
            orderId: order._id,
            product: product._id,
            name: product.name,
            image: product.images && product.images[0] ? product.images[0].url : '',
            quantity: o.quantity,
            price: product.price,
        }]);

        // Mirror real checkout behaviour: stock is decremented on purchase
        await Product.updateOne({ _id: product._id }, { $inc: { stock: -o.quantity } });

        console.log(`  ✔ Delivered order created: #${order.orderNumber} for ${user.email} (${product.name} x${o.quantity}, total ₱${order.totalPrice})`);
    }

    console.log('Test data seed complete!');
    await mongoose.disconnect();
};

run().catch((err) => {
    console.error('Test data seed failed:', err);
    process.exit(1);
});
