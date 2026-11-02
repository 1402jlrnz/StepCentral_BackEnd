const mongoose = require('mongoose');

// Normalized order line item (mirrors PrestigePerf's order_details table).
// Stores a snapshot of name/image/price at purchase time so order history
// stays intact even if the product is later edited or deleted.
const orderDetailSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    price: {
        type: Number,
        required: true
    }
}, {
    timestamps: false
});

module.exports = mongoose.model('OrderDetail', orderDetailSchema, 'orderdetails');
