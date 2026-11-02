/* Phase 4 smoke tests: cart/checkout/orders + email + PDF receipt */
const base = 'http://localhost:4001/api/v1';

const j = async (path, opts = {}) => {
    try {
        const res = await fetch(base + path, {
            ...opts,
            headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    } catch (e) {
        return { status: 0, data: { message: e.message } };
    }
};

const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
    return ok;
};

(async () => {
    const results = [];

    // 1. Register a test user
    const email = `ordertest${Date.now()}@example.com`;
    const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    let r = await j('/register', { method: 'POST', body: { name: 'OrderTest', email, password: 'secret123', avatar } });
    results.push(check('Register user', r.status === 200 && r.data.token));
    const token = r.data.token;
    const auth = { Authorization: `Bearer ${token}` };

    // 2. Get a product to order
    r = await j('/products');
    results.push(check('List products', r.status === 200 && r.data.products?.length > 0));
    const product = r.data.products[0];
    const pid = product._id;

    // 3. Create order (POST /order/new)
    const orderPayload = {
        orderItems: [{ name: product.name, quantity: 2, image: product.images[0].url, price: product.price, product: pid }],
        shippingInfo: { address: '123 Test St', city: 'Test City', phoneNo: '1234567890', postalCode: '12345', country: 'United States' },
        itemsPrice: product.price * 2,
        shippingPrice: product.price * 2 > 200 ? 0 : 25,
        taxPrice: Number((0.05 * product.price * 2).toFixed(2)),
        totalPrice: Number((product.price * 2 + (product.price * 2 > 200 ? 0 : 25) + 0.05 * product.price * 2).toFixed(2)),
        paymentInfo: { id: 'test_payment_123', status: 'succeeded' }
    };
    r = await j('/order/new', { method: 'POST', headers: auth, body: orderPayload });
    results.push(check('Create order', r.status === 200 && r.data.success === true && r.data.order));
    const orderId = r.data.order._id;

    // 4. Get my orders (GET /orders/me)
    r = await j('/orders/me', { headers: auth });
    results.push(check('Get my orders', r.status === 200 && Array.isArray(r.data.orders) && r.data.orders.length > 0));

    // 5. Get single order (GET /order/:id)
    r = await j(`/order/${orderId}`, { headers: auth });
    results.push(check('Get single order', r.status === 200 && r.data.order && r.data.order._id === orderId));

    // 5b. Verify order structure
    const order = r.data.order;
    results.push(check('Order has items', order.orderItems && order.orderItems.length === 1));
    results.push(check('Order has shippingInfo', order.shippingInfo && order.shippingInfo.address));
    results.push(check('Order has paymentInfo', order.paymentInfo && order.paymentInfo.id));
    results.push(check('Order status default Pending', order.orderStatus === 'Pending'));

    // 6. Unauthenticated order creation fails
    r = await j('/order/new', { method: 'POST', body: orderPayload });
    results.push(check('Unauthenticated order -> 401', r.status === 401));

    // 7. Create second order for admin tests
    const email2 = `ordertest2${Date.now()}@example.com`;
    r = await j('/register', { method: 'POST', body: { name: 'OrderTest2', email: email2, password: 'secret123', avatar } });
    const token2 = r.data.token;
    const auth2 = { Authorization: `Bearer ${token2}` };
    r = await j('/order/new', { method: 'POST', headers: auth2, body: orderPayload });
    results.push(check('Second user can create order', r.status === 200 && r.data.success));

    // 8. Admin endpoints (need admin login)
    // Login as admin (seeded in Phase 1)
    const adminLogin = await j('/login', { method: 'POST', body: { email: 'admin@stepcentral.com', password: 'admin123' } });
    results.push(check('Admin login', adminLogin.status === 200 && adminLogin.data.token));
    const adminAuth = { Authorization: `Bearer ${adminLogin.data.token}` };

    // 9. Admin: get all orders
    r = await j('/admin/orders', { headers: adminAuth });
    results.push(check('Admin get all orders', r.status === 200 && Array.isArray(r.data.orders) && r.data.orders.length >= 2));

    // 10. Admin: update order status
    r = await j(`/admin/order/${orderId}`, { method: 'PUT', headers: adminAuth, body: { status: 'Shipped' } });
    results.push(check('Admin update order status', r.status === 200 && r.data.success === true));

    // 11. Verify status changed
    r = await j(`/order/${orderId}`, { headers: auth });
    results.push(check('Order status updated to Shipped', r.status === 200 && r.data.order.orderStatus === 'Shipped'));

    // 12. Admin: get total orders
    r = await j('/admin/total-orders', { headers: adminAuth });
    results.push(check('Admin total orders', r.status === 200 && r.data.totalOrders && typeof r.data.totalOrders[0]?.count === 'number'));

    // 13. Admin: get total sales
    r = await j('/admin/total-sales', { headers: adminAuth });
    results.push(check('Admin total sales', r.status === 200 && r.data.totalSales && typeof r.data.totalSales[0]?.totalSales === 'number'));

    // 14. Admin: get sales per month
    r = await j('/admin/sales-per-month', { headers: adminAuth });
    results.push(check('Admin sales per month', r.status === 200 && Array.isArray(r.data.salesPerMonth)));

    // 15. Admin: get customer sales
    r = await j('/admin/customer-sales', { headers: adminAuth });
    results.push(check('Admin customer sales', r.status === 200 && Array.isArray(r.data.customerSales)));

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exit(passed === results.length ? 0 : 1);
})();