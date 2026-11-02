const express = require('express');
const router = express.Router();

const {
    newProduct,
    getSingleProduct,
    getProducts,
    updateProduct,
    deleteProduct,
    deleteProducts,
    getAdminProducts,
    createProductReview,
    getProductReviews,
    getAllReviews,
    deleteReview,

} = require('../controllers/product');
const { isAuthenticatedUser, authorizeRoles } = require('../middleware/auth')
const upload = require('../utils/multer')

// Product images arrive as multipart/form-data files (field name: "images").
// JSON base64 bodies are still accepted by the controller as a fallback.
router.post('/admin/product/new', isAuthenticatedUser, authorizeRoles('admin'), upload.array('images', 6), newProduct);
router.get('/product/:id', getSingleProduct)
router.get('/products', getProducts)
router.put('/admin/product/:id', isAuthenticatedUser, authorizeRoles('admin'), upload.array('images', 6), updateProduct);
router.delete('/admin/product/:id', isAuthenticatedUser, authorizeRoles('admin'), deleteProduct);
router.delete('/admin/products', isAuthenticatedUser, authorizeRoles('admin'), deleteProducts);
router.get('/admin/products', isAuthenticatedUser, authorizeRoles('admin'), getAdminProducts)
router.put('/review', isAuthenticatedUser, createProductReview);
router.get('/reviews', isAuthenticatedUser, getProductReviews)
router.get('/admin/reviews', isAuthenticatedUser, authorizeRoles('admin'), getAllReviews)
router.delete('/reviews', isAuthenticatedUser, authorizeRoles('admin'), deleteReview)

module.exports = router;
