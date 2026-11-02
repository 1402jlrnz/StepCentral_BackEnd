/* Phase 3 smoke tests: product reviews + bad-words filter */
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

    // 1. Register a test user (unique name to avoid conflicts with old test data)
    const testId = Date.now();
    const email = `reviewtest${testId}@example.com`;
    const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    let r = await j('/register', { method: 'POST', body: { name: `Reviewer${testId}`, email, password: 'secret123', avatar } });
    results.push(check('Register reviewer', r.status === 200 && r.data.token));
    const token = r.data.token;
    const auth = { Authorization: `Bearer ${token}` };
    const reviewerName = `Reviewer${testId}`;

    // 2. Get a product ID to review (use first product)
    r = await j('/products');
    results.push(check('List products', r.status === 200 && r.data.products?.length > 0));
    const productId = r.data.products[0]._id;

    // 2b. Order the product first — users can only review products they purchased
    const orderedProduct = r.data.products[0];
    const orderPayload = {
        orderItems: [{ name: orderedProduct.name, quantity: 1, image: orderedProduct.images[0].url, price: orderedProduct.price, product: productId }],
        shippingInfo: { address: '123 Test St', city: 'Test City', phoneNo: '1234567890', postalCode: '12345', country: 'United States' },
        itemsPrice: orderedProduct.price,
        shippingPrice: 25,
        taxPrice: Number((0.05 * orderedProduct.price).toFixed(2)),
        totalPrice: Number((orderedProduct.price + 25 + 0.05 * orderedProduct.price).toFixed(2)),
        paymentInfo: { id: 'test_payment_123', status: 'succeeded' }
    };
    r = await j('/order/new', { method: 'POST', headers: auth, body: orderPayload });
    results.push(check('Create order before review', r.status === 200 && r.data.success === true));

    // 3. Create a clean review
    r = await j('/review', { method: 'PUT', headers: auth, body: { productId, rating: 5, comment: 'Great product, love it!' } });
    results.push(check('Create clean review', r.status === 200 && r.data.success === true));

    // 4. Create a review with profanity (should be filtered)
    r = await j('/review', { method: 'PUT', headers: auth, body: { productId, rating: 1, comment: 'This is shit and fucking terrible' } });
    results.push(check('Create profane review -> filtered', r.status === 200 && r.data.success === true));

    // 5. Get reviews and verify profanity was filtered (requires auth)
    r = await j(`/reviews?id=${productId}`, { headers: auth });
    results.push(check('Get reviews', r.status === 200 && Array.isArray(r.data.reviews)));
    const reviews = r.data.reviews;
    // Check the current user's review (the one they just submitted) is filtered
    const myReview = reviews.find(rv => rv.name === reviewerName);
    results.push(check('Profanity filtered in stored review', myReview && !myReview.comment.includes('shit') && !myReview.comment.includes('fucking')));

    // 6. Duplicate review from same user should update existing
    r = await j('/review', { method: 'PUT', headers: auth, body: { productId, rating: 4, comment: 'Updated review, still good' } });
    results.push(check('Update existing review', r.status === 200 && r.data.success === true));

    // 7. Get reviews again - should only have 1 review from this user
    r = await j(`/reviews?id=${productId}`, { headers: auth });
    const updatedReviews = r.data.reviews;
    const myReviews = updatedReviews.filter(rv => rv.name === reviewerName);
    results.push(check('Review count correct (1 review from this user)', r.status === 200 && myReviews.length === 1));

    // 8. Unauthenticated review should fail
    r = await j('/review', { method: 'PUT', body: { productId, rating: 3, comment: 'No auth' } });
    results.push(check('Unauthenticated review -> 401', r.status === 401));

    // 9. Bad words filter utility directly
    const filter = require('../utils/badWords');
    results.push(check('Bad-words filter: clean passes', filter.clean('hello world') === 'hello world'));
    results.push(check('Bad-words filter: profanity blocked', filter.clean('this is shit') === 'this is ****'));
    results.push(check('Bad-words filter: scam words', filter.clean('scam ripoff') === '**** ******'));

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exit(passed === results.length ? 0 : 1);
})();