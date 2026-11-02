// Seeds an admin user and sample footwear products
// Run: npm run seed
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const cloudinary = require('cloudinary');
const connectDatabase = require('./config/database');
const Product = require('./models/product');
const User = require('./models/user');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Build a colored SVG placeholder as a data URI (uploadable to Cloudinary)
const svgImage = (label, color) => {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="450">
      <rect width="600" height="450" fill="${color}"/>
      <text x="50%" y="45%" font-size="42" font-family="Arial" fill="#ffffff" text-anchor="middle" font-weight="bold">${label}</text>
      <text x="50%" y="60%" font-size="24" font-family="Arial" fill="#ffffffcc" text-anchor="middle">Step Central</text>
    </svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

const products = [
    // Running
    { name: 'AeroRun Pro', price: 129.99, category: 'Running', stock: 25, seller: 'Step Central Official', description: 'Lightweight running shoe with responsive cushioning for daily miles.', color: '#e74c3c' },
    { name: 'Sprint Fly 2', price: 99.5, category: 'Running', stock: 18, seller: 'Step Central Official', description: 'Breathable mesh runner built for speed work and race day.', color: '#c0392b' },
    // Basketball
    { name: 'Court King AJ', price: 189.99, category: 'Basketball', stock: 12, seller: 'Step Central Official', description: 'High-top basketball shoe with lockdown support and Air cushioning.', color: '#8e44ad' },
    { name: 'Dunk Force High', price: 149.0, category: 'Basketball', stock: 9, seller: 'Step Central Official', description: 'Court-ready high tops with durable traction for hard cuts.', color: '#9b59b6' },
    // Lifestyle
    { name: 'Urban Classic 77', price: 79.99, category: 'Lifestyle', stock: 40, seller: 'Step Central Official', description: 'Retro everyday sneaker that goes with anything in your closet.', color: '#2980b9' },
    { name: 'Retro Slip-On', price: 59.95, category: 'Lifestyle', stock: 33, seller: 'Step Central Official', description: 'Easy slip-on lifestyle shoe with all-day comfort.', color: '#3498db' },
];

const seedIt = async () => {
    try {
        await connectDatabase();

        console.log('Clearing old products...');
        await Product.deleteMany({});

        console.log('Creating admin user if missing...');
        const adminExists = await User.findOne({ email: 'admin@stepcentral.com' });
        if (!adminExists) {
            const avatar = await cloudinary.v2.uploader.upload(svgImage('SC', '#232f3e'), { folder: 'avatars', width: 150, crop: 'scale' });
            await User.create({
                name: 'Step Central Admin',
                email: 'admin@stepcentral.com',
                password: 'admin123',
                role: 'admin',
                avatar: { public_id: avatar.public_id, url: avatar.secure_url }
            });
            console.log('Admin created: admin@stepcentral.com / admin123');
        } else {
            console.log('Admin already exists, skipping.');
        }

        console.log('Uploading sample products to Cloudinary...');
        for (const p of products) {
            const result = await cloudinary.v2.uploader.upload(svgImage(p.name, p.color), { folder: 'products', width: 150, crop: 'scale' });
            await Product.create({
                name: p.name,
                price: p.price,
                description: p.description,
                category: p.category,
                seller: p.seller,
                stock: p.stock,
                images: [{ public_id: result.public_id, url: result.secure_url }]
            });
            console.log(`  ✔ ${p.name}`);
        }

        console.log('Seed complete!');
        process.exit();
    } catch (err) {
        console.error('Seed failed:', err);
        process.exit(1);
    }
};

seedIt();
