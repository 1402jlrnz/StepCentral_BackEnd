const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cloudinary = require('cloudinary');

// Cloudinary config (product & avatar images)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const products = require('./routes/product');
const auth = require('./routes/auth');
const order = require('./routes/order');

const isProduction = /^production$/i.test(process.env.NODE_ENV || '');
const frontendOrigin = process.env.FRONTEND_URL?.replace(/\/+$/, '');
const allowedOrigins = new Set([
    frontendOrigin,
    ...(!isProduction ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])
].filter(Boolean));

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) {
            return callback(null, true);
        }
        const error = new Error('Origin is not allowed by CORS');
        error.statusCode = 403;
        return callback(error);
    },
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use('/api/v1', products);
app.use('/api/v1', auth);
app.use('/api/v1', order);

// Global error handler — always respond with JSON so the frontend can toast the message
app.use((err, req, res, next) => {
    let message = err.message || 'Internal Server Error';

    // Mongoose duplicate key (e.g. email already registered)
    if (err.code === 11000) {
        message = `${Object.keys(err.keyValue || { field: '' })[0]} already exists`;
    }
    // Mongoose validation error — show the first field error
    if (err.name === 'ValidationError') {
        message = Object.values(err.errors).map(e => e.message)[0];
    }

    res.status(err.statusCode || 500).json({
        success: false,
        message
    });
});

module.exports = app;
