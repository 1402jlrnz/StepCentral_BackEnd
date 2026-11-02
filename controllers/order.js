const Order = require('../models/order');
const OrderDetail = require('../models/orderDetail');
const Product = require('../models/product');
const sendEmail = require('../utils/sendEmail');
const PDFDocument = require('pdfkit');

const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

// ₱ formatter
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPhp = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Restore stock for each line item (used on cancel)
async function restoreStock(items) {
    for (const item of items) {
        if (item.product && item.quantity > 0) {
            await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
        }
    }
}

// Build the itemized block used in order emails
function itemsBlock(items) {
    return items.map(i => `  • ${i.name} x ${i.quantity} — ${peso(i.price * i.quantity)}`).join('\n');
}

// Create a new order   =>  /api/v1/order/new
exports.newOrder = async (req, res, next) => {
    try {
        const {
            orderItems,
            shippingInfo,
            itemsPrice,
            taxPrice,
            shippingPrice,
            totalPrice,
            paymentInfo
        } = req.body;

        if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
            return res.status(400).json({ message: 'No order items' });
        }

        // Validate stock for every line item before creating the order
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            const quantity = Math.abs(Number(item.quantity));
            if (!product) {
                return res.status(400).json({ message: `Product not found: ${item.name}` });
            }
            if (quantity > product.stock) {
                return res.status(400).json({ message: `Insufficient stock for ${item.name}. Only ${product.stock} left.` });
            }
        }

        // Sequential order number for easy tracking: Order #1, #2, #3, ...
        const lastOrder = await Order.findOne().sort({ orderNumber: -1 }).select('orderNumber');
        const orderNumber = lastOrder && lastOrder.orderNumber ? lastOrder.orderNumber + 1 : 1;

        // 1. Create the order header
        const order = await Order.create({
            orderNumber,
            shippingInfo,
            itemsPrice,
            taxPrice,
            shippingPrice,
            totalPrice,
            paymentInfo,
            paidAt: Date.now(),
            user: req.user._id
        });

        try {
            // 2. Create normalized line items (order_details style)
            await OrderDetail.insertMany(orderItems.map(item => ({
                orderId: order._id,
                product: item.product,
                name: item.name,
                image: item.image,
                quantity: item.quantity,
                price: item.price
            })));

            // 3. Decrement stock
            for (const item of orderItems) {
                await Product.updateOne(
                    { _id: item.product },
                    { $inc: { stock: -Math.abs(Number(item.quantity)) } }
                );
            }
        } catch (err) {
            // Compensate: roll the header back so we never ship an empty order
            await Order.findByIdAndDelete(order._id);
            throw err;
        }

        // 4. Populate line items for the response / email / PDF
        await order.populate('orderItems');

        // 5. Send order confirmation email with PDF receipt
        try {
            const user = req.user;
            const pdfBuffer = await generateOrderReceiptPDF(order, user);
            await sendEmail({
                email: user.email,
                subject: `Step Central - Order Confirmation #${order.orderNumber}`,
                message: `Hi ${user.name},\n\nThank you for your order! Your order #${order.orderNumber} has been confirmed and is being processed.\n\nItems:\n${itemsBlock(order.orderItems)}\n\nSubtotal: ${peso(order.itemsPrice)}\nShipping: ${peso(order.shippingPrice)}\nGrand Total: ${peso(order.totalPrice)}\n\nA PDF receipt is attached.\n\nThank you for shopping with Step Central!`,
                attachments: [{
                    filename: `receipt-${order._id}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }]
            });
        } catch (emailError) {
            console.error('Failed to send order confirmation email:', emailError);
            // Don't fail the order if email fails
        }

        res.status(200).json({
            success: true,
            order
        })
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Generate PDF receipt
async function generateOrderReceiptPDF(order, user) {
    return new Promise((resolve, reject) => {
        const margin = 48;
        const doc = new PDFDocument({ size: 'LETTER', margin });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width;
        const contentWidth = pageWidth - margin * 2;
        const left = margin;
        const right = left + contentWidth;
        const colors = {
            ink: '#172033',
            muted: '#64748b',
            border: '#e2e8f0',
            surface: '#f8fafc',
            accent: '#ef4444',
            white: '#ffffff'
        };
        const dateText = value => value ? new Date(value).toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) : 'N/A';

        const drawPageHeader = (continued = false) => {
            doc.rect(0, 0, pageWidth, 112).fill(colors.ink);
            doc.rect(0, 108, pageWidth, 4).fill(colors.accent);
            doc.font('Helvetica-Bold').fontSize(23).fillColor(colors.white)
                .text('Step Central', left, 30, { lineBreak: false });
            doc.font('Helvetica').fontSize(9).fillColor('#cbd5e1')
                .text('ONLINE FOOTWEAR STORE', left, 59, { characterSpacing: 1.2 });
            doc.font('Helvetica-Bold').fontSize(17).fillColor(colors.white)
                .text(continued ? 'ORDER RECEIPT · CONTINUED' : 'ORDER RECEIPT', left, 82, {
                    width: contentWidth,
                    align: 'right'
                });
            doc.y = 132;
        };

        const drawTableHeader = y => {
            const columns = {
                item: left + 12,
                quantity: left + 282,
                unitPrice: left + 335,
                total: left + 419
            };
            const tableWidth = contentWidth;
            doc.roundedRect(left, y, tableWidth, 27, 4).fill(colors.ink);
            doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.white);
            doc.text('ITEM', columns.item, y + 9, { lineBreak: false });
            doc.text('QTY', columns.quantity, y + 9, { width: 40, align: 'center', lineBreak: false });
            doc.text('UNIT PRICE', columns.unitPrice, y + 9, { width: 90, align: 'right', lineBreak: false });
            doc.text('AMOUNT', columns.total, y + 9, { width: 85, align: 'right', lineBreak: false });
            return { columns, y: y + 27 };
        };

        drawPageHeader();

        const topInfoY = doc.y;
        const cardGap = 14;
        const cardWidth = (contentWidth - cardGap) / 2;
        const cardHeight = 91;
        doc.roundedRect(left, topInfoY, cardWidth, cardHeight, 6)
            .fillAndStroke(colors.surface, colors.border);
        doc.roundedRect(left + cardWidth + cardGap, topInfoY, cardWidth, cardHeight, 6)
            .fillAndStroke(colors.surface, colors.border);

        doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.muted)
            .text('CUSTOMER', left + 13, topInfoY + 12);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink)
            .text(user.name || 'Customer', left + 13, topInfoY + 29, { width: cardWidth - 26 });
        doc.font('Helvetica').fontSize(8.5).fillColor(colors.muted)
            .text(user.email || '', left + 13, topInfoY + 49, { width: cardWidth - 26 });
        doc.text(`Phone: ${order.shippingInfo.phoneNo || 'N/A'}`, left + 13, topInfoY + 67, {
            width: cardWidth - 26
        });

        const orderCardX = left + cardWidth + cardGap;
        doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.muted)
            .text('ORDER DETAILS', orderCardX + 13, topInfoY + 12);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink)
            .text(`Order #${order.orderNumber || order._id}`, orderCardX + 13, topInfoY + 29, {
                width: cardWidth - 26
            });
        doc.font('Helvetica').fontSize(8.5).fillColor(colors.muted)
            .text(`Placed ${dateText(order.createdAt)}`, orderCardX + 13, topInfoY + 49);
        doc.text(`Status: ${order.orderStatus}`, orderCardX + 13, topInfoY + 67, {
            width: cardWidth - 26
        });

        let y = topInfoY + cardHeight + 20;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink)
            .text('SHIP TO', left, y);
        y += 17;
        doc.font('Helvetica').fontSize(9).fillColor(colors.muted);
        const shippingLines = [
            order.shippingInfo.address,
            `${order.shippingInfo.city}, ${order.shippingInfo.postalCode}`,
            order.shippingInfo.country
        ].filter(Boolean);
        shippingLines.forEach(line => {
            doc.text(line, left, y, { width: contentWidth });
            y = doc.y + 2;
        });

        y += 14;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink)
            .text('ITEMIZED SUMMARY', left, y);
        y += 18;

        let table = drawTableHeader(y);
        y = table.y;
        const items = order.orderItems || [];
        items.forEach((item, index) => {
            const itemName = item.name || 'Product';
            const itemHeight = Math.max(34, doc.heightOfString(itemName, {
                width: 245,
                font: 'Helvetica',
                fontSize: 9
            }) + 16);
            if (y + itemHeight > doc.page.height - margin - 105) {
                doc.addPage();
                drawPageHeader(true);
                table = drawTableHeader(doc.y);
                y = table.y;
            }

            if (index % 2 === 0) {
                doc.rect(left, y, contentWidth, itemHeight).fill(colors.surface);
            }
            doc.font('Helvetica').fontSize(9).fillColor(colors.ink);
            doc.text(itemName, table.columns.item, y + 8, {
                width: 245,
                height: itemHeight - 12
            });
            doc.text(String(item.quantity || 0), table.columns.quantity, y + 9, {
                width: 40,
                align: 'center',
                lineBreak: false
            });
            doc.text(formatPhp(item.price), table.columns.unitPrice, y + 9, {
                width: 90,
                align: 'right',
                lineBreak: false
            });
            doc.font('Helvetica-Bold').text(formatPhp(Number(item.price || 0) * Number(item.quantity || 0)), table.columns.total, y + 9, {
                width: 85,
                align: 'right',
                lineBreak: false
            });
            doc.moveTo(left, y + itemHeight).lineTo(right, y + itemHeight)
                .strokeColor(colors.border).lineWidth(0.5).stroke();
            y += itemHeight;
        });

        const summaryHeight = 112;
        if (y + summaryHeight > doc.page.height - margin) {
            doc.addPage();
            drawPageHeader(true);
            y = doc.y;
        } else {
            y += 16;
        }

        const summaryWidth = 250;
        const summaryX = right - summaryWidth;
        doc.roundedRect(summaryX, y, summaryWidth, summaryHeight, 6)
            .fillAndStroke(colors.surface, colors.border);
        const summaryLabelX = summaryX + 14;
        const summaryValueX = summaryX + 115;
        const summaryRow = (label, value, rowY, strong = false) => {
            doc.font(strong ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(strong ? 11 : 9)
                .fillColor(strong ? colors.ink : colors.muted)
                .text(label, summaryLabelX, rowY);
            doc.font(strong ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(strong ? 11 : 9)
                .fillColor(strong ? colors.ink : colors.muted)
                .text(value, summaryValueX, rowY, {
                    width: summaryWidth - 129,
                    align: 'right',
                    lineBreak: false
                });
        };
        summaryRow('Subtotal', formatPhp(order.itemsPrice), y + 14);
        summaryRow('Shipping', formatPhp(order.shippingPrice), y + 34);
        summaryRow('Tax', formatPhp(order.taxPrice), y + 54);
        doc.moveTo(summaryX + 14, y + 77).lineTo(right - 14, y + 77)
            .strokeColor(colors.border).stroke();
        summaryRow('GRAND TOTAL', formatPhp(order.totalPrice), y + 88, true);

        y += summaryHeight + 24;
        if (y + 60 > doc.page.height - margin) {
            doc.addPage();
            drawPageHeader(true);
            y = doc.y;
        }
        doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.ink)
            .text('PAYMENT', left, y);
        y += 17;
        doc.font('Helvetica').fontSize(8.5).fillColor(colors.muted);
        doc.text(`Method: ${order.paymentInfo?.method || 'N/A'}`, left, y);
        doc.text(`Status: ${order.paymentInfo?.status || 'N/A'}`, left + 160, y);
        doc.text(`Reference: ${order.paymentInfo?.reference || order.paymentInfo?.id || 'N/A'}`, left, y + 14, {
            width: contentWidth
        });
        doc.text(`Paid at: ${dateText(order.paidAt)}`, left, y + 28);

        const footerY = Math.min(doc.page.height - 42, y + 62);
        doc.moveTo(left, footerY - 10).lineTo(right, footerY - 10)
            .strokeColor(colors.border).stroke();
        doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.ink)
            .text('Thank you for shopping with Step Central.', left, footerY, {
                width: contentWidth,
                align: 'center'
            });
        doc.font('Helvetica').fontSize(8).fillColor(colors.muted)
            .text('All amounts are shown in Philippine pesos (PHP).', left, footerY + 14, {
                width: contentWidth,
                align: 'center'
            });

        doc.end();
    });
}

exports.myOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ user: req.user.id }).populate('orderItems');
        res.status(200).json({
            success: true,
            orders
        })
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.getSingleOrder = async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('orderItems');
        if (!order) {
            return res.status(404).json({
                message: 'No Order found with this ID',
            })
        }
        res.status(200).json({
            success: true,
            order
        })
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.allOrders = async (req, res, next) => {
    try {
        const orders = await Order.find().populate('orderItems');
        let totalAmount = 0;

        orders.forEach(order => {
            totalAmount += order.totalPrice
        })

        res.status(200).json({
            success: true,
            totalAmount,
            orders
        })
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.deleteOrder = async (req, res, next) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id)

        if (!order) {
            return res.status(400).json({
                message: 'No Order found with this ID',
            })
        }

        // Remove normalized line items too
        await OrderDetail.deleteMany({ orderId: order._id });

        res.status(200).json({
            success: true
        })
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Admin status update   =>  PUT /api/v1/admin/order/:id
exports.updateOrder = async (req, res, next) => {
    try {
        const { status } = req.body;

        if (!ORDER_STATUSES.includes(status)) {
            return res.status(400).json({ message: 'Invalid order status' });
        }

        const order = await Order.findById(req.params.id).populate('orderItems');

        if (!order) {
            return res.status(404).json({
                message: 'No Order found with this ID',
            })
        }

        if (order.orderStatus === 'Delivered') {
            return res.status(400).json({
                message: 'You have already delivered this order',
            })
        }

        const oldStatus = order.orderStatus;

        // Cancelled -> put the stock back (it was decremented at order creation)
        if (status === 'Cancelled' && oldStatus !== 'Cancelled') {
            await restoreStock(order.orderItems);
        }

        order.orderStatus = status;

        if (status === 'Delivered') {
            order.deliveredAt = Date.now();
            order.dateReceived = Date.now();
        }

        await order.save();

        // Send status update email with items / subtotal / grand total
        if (oldStatus !== status) {
            try {
                const user = await order.populate('user', 'name email');
                const pdfBuffer = await generateOrderReceiptPDF(order, user.user);
                await sendEmail({
                    email: user.user.email,
                    subject: `Step Central - Order Status Update #${order._id}`,
                    message: `Hi ${user.user.name},\n\nYour order #${order._id} status has been updated from "${oldStatus}" to "${status}".\n\nItems:\n${itemsBlock(order.orderItems)}\n\nSubtotal: ${peso(order.itemsPrice)}\nShipping: ${peso(order.shippingPrice)}\nTax: ${peso(order.taxPrice)}\nGrand Total: ${peso(order.totalPrice)}\n\n${status === 'Delivered' ? 'Your order has been delivered! Thank you for shopping with us.' : ''}\nTrack your order: http://localhost:5173/order/${order._id}\n\nThank you for shopping with Step Central!`,
                    attachments: [{
                        filename: `receipt-${order._id}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }]
                });
            } catch (emailError) {
                console.error('Failed to send status update email:', emailError);
            }
        }

        res.status(200).json({
            success: true,
        })
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Customer self-cancel (Pending orders only)   =>  PUT /api/v1/order/:id/cancel
exports.cancelMyOrder = async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id).populate('orderItems');

        if (!order) {
            return res.status(404).json({ message: 'No Order found with this ID' });
        }

        if (String(order.user) !== String(req.user._id)) {
            return res.status(403).json({ message: 'You can only cancel your own orders' });
        }

        if (order.orderStatus !== 'Pending') {
            return res.status(400).json({ message: `Only Pending orders can be cancelled (this order is ${order.orderStatus})` });
        }

        // Put the stock back, then mark cancelled
        await restoreStock(order.orderItems);
        order.orderStatus = 'Cancelled';
        await order.save();

        try {
            await sendEmail({
                email: req.user.email,
                subject: `Step Central - Order Cancelled #${order._id}`,
                message: `Hi ${req.user.name},\n\nYour order #${order._id} has been cancelled and its stock has been returned.\n\nItems:\n${itemsBlock(order.orderItems)}\n\nGrand Total (voided): ${peso(order.totalPrice)}\n\nSorry to see you go — you can reorder anytime.\n\nThank you for shopping with Step Central!`
            });
        } catch (emailError) {
            console.error('Failed to send cancellation email:', emailError);
        }

        res.status(200).json({ success: true, order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.totalOrders = async (req, res, next) => {
    const totalOrders = await Order.aggregate([
        {
            $group: {
                _id: null,
                count: { $sum: 1 }
            }
        }
    ])
    res.status(200).json({
        success: true,
        totalOrders
    })
}

exports.totalSales = async (req, res, next) => {
    const totalSales = await Order.aggregate([
        {
            $group: {
                _id: null,
                totalSales: { $sum: "$totalPrice" }
            }
        }
    ])
    res.status(200).json({
        success: true,
        totalSales
    })
}

exports.customerSales = async (req, res, next) => {
    const customerSales = await Order.aggregate([
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'userDetails'
            },
        },
        { $unwind: "$userDetails" },
        {
            $group: {
                _id: "$user",
                total: { $sum: "$totalPrice" },
                doc: { "$first": "$$ROOT" },
            }
        },
        {
            $replaceRoot: {
                newRoot: { $mergeObjects: [{ total: '$total' }, '$doc'] },
            },
        },
        {
            $project: {
                _id: 0,
                "userDetails.name": true,
                total: true,
            }
        },
        { $sort: { total: 1 } },
    ])
    res.status(200).json({
        success: true,
        customerSales
    })
}

exports.salesPerMonth = async (req, res, next) => {
    const salesPerMonth = await Order.aggregate([
        {
            $group: {
                _id: {
                    year: { $year: "$paidAt" },
                    month: { $month: "$paidAt" }
                },
                total: { $sum: "$totalPrice" },
            },
        },
        {
            $addFields: {
                month: {
                    $let: {
                        vars: {
                            monthsInString: [, 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                        },
                        in: {
                            $arrayElemAt: ['$$monthsInString', "$_id.month"]
                        }
                    }
                }
            }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        {
            $project: {
                _id: 0,
                month: true,
                total: true,
            }
        }
    ])
    res.status(200).json({
        success: true,
        salesPerMonth
    })
}

// Sales by date range (for Quiz 2 date-range filter chart)  =>  /api/v1/admin/sales
exports.salesByDateRange = async (req, res, next) => {
    const { startDate, endDate } = req.query;

    // Build date filter on paidAt
    const match = {};
    if (startDate || endDate) {
        match.paidAt = {};
        if (startDate) match.paidAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // include the whole end day
            match.paidAt.$lte = end;
        }
    }

    // Group sales by day
    const sales = await Order.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
                total: { $sum: "$totalPrice" },
                orders: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                date: "$_id",
                total: 1,
                orders: 1
            }
        }
    ])

    // Totals for the filtered range
    const totals = sales.reduce((acc, day) => {
        acc.total += day.total;
        acc.orders += day.orders;
        return acc;
    }, { total: 0, orders: 0 })

    res.status(200).json({
        success: true,
        sales,
        totalSales: totals.total,
        totalOrders: totals.orders
    })
}

// Product sales distribution (percentage per product)
// Line items live in their own `orderdetails` collection now, so $lookup first.
exports.productSales = async (req, res, next) => {
    const productSales = await Order.aggregate([
        {
            $lookup: {
                from: 'orderdetails',
                localField: '_id',
                foreignField: 'orderId',
                as: 'items'
            }
        },
        { $unwind: "$items" },
        {
            $group: {
                _id: "$items.name",
                totalQuantity: { $sum: "$items.quantity" },
                totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
            }
        },
        {
            $group: {
                _id: null,
                totalQuantity: { $sum: "$totalQuantity" },
                items: { $push: { name: "$_id", quantity: "$totalQuantity", revenue: "$totalRevenue" } }
            }
        },
        { $unwind: "$items" },
        {
            $project: {
                name: "$items.name",
                quantity: "$items.quantity",
                revenue: "$items.revenue",
                percent: {
                    $multiply: [
                        { $divide: ["$items.quantity", "$totalQuantity"] },
                        100
                    ]
                }
            }
        },
        { $sort: { percent: -1 } }
    ])

    res.status(200).json({
        success: true,
        totalPercentage: productSales
    })
}
