const express = require('express');
const router = express.Router();

const {
    newOrder,
    myOrders,
    getSingleOrder,
    deleteOrder,
    allOrders,
    updateOrder,
    cancelMyOrder,
    totalOrders,
    totalSales,
    customerSales,
    salesPerMonth,
    salesByDateRange,
    productSales,
} = require('../controllers/order')

const { isAuthenticatedUser, authorizeRoles } = require('../middleware/auth')

router.post('/order/new', isAuthenticatedUser, newOrder);
router.get('/orders/me', isAuthenticatedUser, myOrders);
router.get('/order/:id', isAuthenticatedUser, getSingleOrder);
router.put('/order/:id/cancel', isAuthenticatedUser, cancelMyOrder);
router.get('/admin/orders', isAuthenticatedUser, authorizeRoles('admin'), allOrders);
router.route('/admin/order/:id')
    .put(isAuthenticatedUser, authorizeRoles('admin'), updateOrder)
    .delete(isAuthenticatedUser, authorizeRoles('admin'), deleteOrder);
router.get('/admin/total-orders', isAuthenticatedUser, authorizeRoles('admin'), totalOrders);
router.get('/admin/total-sales', isAuthenticatedUser, authorizeRoles('admin'), totalSales);
router.get('/admin/customer-sales', isAuthenticatedUser, authorizeRoles('admin'), customerSales);
router.get('/admin/sales-per-month', isAuthenticatedUser, authorizeRoles('admin'), salesPerMonth);
router.get('/admin/sales', isAuthenticatedUser, authorizeRoles('admin'), salesByDateRange);
router.get('/admin/product-sales', isAuthenticatedUser, authorizeRoles('admin'), productSales);

module.exports = router;