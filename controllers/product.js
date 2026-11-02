const Product = require('../models/product')
const Order = require('../models/order');
const OrderDetail = require('../models/orderDetail');
const cloudinary = require('cloudinary')
const APIFeatures = require('../utils/apiFeatures');

// Cloudinary upload options for product photos (stored in the `products` folder,
// bounded to 1000x1000 so large phone photos don't blow storage — no upscaling).
const CLOUDINARY_UPLOAD_OPTS = {
    folder: 'products',
    width: 1000,
    height: 1000,
    crop: 'limit',
    quality: 'auto',
};

// Upload an in-memory file (multer memoryStorage) to Cloudinary.
const uploadBuffer = (buffer) => new Promise((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream(CLOUDINARY_UPLOAD_OPTS, (error, result) => {
        if (error) return reject(error);
        resolve(result);
    });
    stream.end(buffer);
});

// Best-effort removal of product images from Cloudinary.
// Skips fake external/<slug> ids (seeded with external URLs) and never throws,
// so a Cloudinary hiccup can't block a delete/update response.
const destroyImages = async (images = []) => {
    for (const img of images) {
        if (!img || !img.public_id || String(img.public_id).startsWith('external/')) continue;
        try {
            await cloudinary.v2.uploader.destroy(img.public_id);
        } catch (error) {
            console.log(`[cloudinary] destroy failed for ${img.public_id}: ${error.message}`);
        }
    }
};

// Collect image sources from a request: multipart files (preferred) or legacy
// base64 data-URL strings in req.body.images (kept for backward compatibility).
const getImageSources = (req) => {
    if (req.files && req.files.length > 0) {
        return req.files.map(file => file.buffer);
    }
    if (typeof req.body.images === 'string' && req.body.images) {
        return [req.body.images];
    }
    if (Array.isArray(req.body.images)) {
        return req.body.images;
    }
    return [];
};

// Upload every source, returning [{ public_id, url }].
// On failure, any images already uploaded are removed so nothing is orphaned.
const uploadImageSources = async (sources) => {
    const imagesLinks = [];
    for (const source of sources) {
        try {
            const result = Buffer.isBuffer(source)
                ? await uploadBuffer(source)
                : await cloudinary.v2.uploader.upload(source, CLOUDINARY_UPLOAD_OPTS);
            imagesLinks.push({ public_id: result.public_id, url: result.secure_url });
        } catch (error) {
            console.log(error);
            await destroyImages(imagesLinks);
            throw error;
        }
    }
    return imagesLinks;
};

exports.newProduct = async (req, res, next) => {
    const sources = getImageSources(req)

    if (sources.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Please upload at least one image'
        })
    }

    let imagesLinks;
    try {
        imagesLinks = await uploadImageSources(sources)
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Image upload failed'
        })
    }

    const product = await Product.create({ ...req.body, images: imagesLinks });

    if (!product)
        return res.status(400).json({
            success: false,
            message: 'Product not created'
        })


    return res.status(201).json({
        success: true,
        product
    })
}

exports.getSingleProduct = async (req, res, next) => {
    const product = await Product.findById(req.params.id);
    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        })
    }
    return res.status(200).json({
        success: true,
        product
    })
}

exports.getProducts = async (req, res) => {

    const resPerPage = 4;
    const productsCount = await Product.countDocuments();

    const apiFeatures = new APIFeatures(Product.find(), req.query).search().filter()

    // Count filtered products (before pagination is applied)
    const filteredProductsCount = await new APIFeatures(Product.find(), req.query).search().filter().query.countDocuments();

    apiFeatures.pagination(resPerPage);
    const products = await apiFeatures.query;

    if (!products)
        return res.status(400).json({ message: 'error loading products' })
    return res.status(200).json({
        success: true,
        products,
        filteredProductsCount,
        resPerPage,
        productsCount,

    })
}

exports.updateProduct = async (req, res, next) => {
    let product = await Product.findById(req.params.id);
    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        })
    }

    const oldImages = [...product.images]
    const sources = getImageSources(req)

    if (sources.length > 0) {
        // Upload the NEW images first — only after they succeed do we remove the
        // old assets, so a failed upload never leaves the product with broken images.
        let imagesLinks;
        try {
            imagesLinks = await uploadImageSources(sources)
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Image upload failed'
            })
        }

        await destroyImages(oldImages)
        req.body.images = imagesLinks
    } else {
        // No new images sent — don't overwrite the existing ones
        delete req.body.images
    }

    product = await Product.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
        useFindandModify: false
    })
    return res.status(200).json({
        success: true,
        product
    })
}

exports.deleteProduct = async (req, res, next) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        })
    }

    // Cloudinary cleanup: remove the product's images so they don't get orphaned
    await destroyImages(product.images);

    return res.status(200).json({
        success: true,
        message: 'Product deleted'
    })
}

// Bulk delete products (checkbox selection on admin datatable)
exports.deleteProducts = async (req, res, next) => {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No products selected'
        })
    }

    // Fetch first so we still know each product's images after the delete
    const products = await Product.find({ _id: { $in: productIds } });

    const result = await Product.deleteMany({ _id: { $in: productIds } })

    if (result.deletedCount === 0) {
        return res.status(404).json({
            success: false,
            message: 'No products found to delete'
        })
    }

    // Cloudinary cleanup for every deleted product (best-effort)
    for (const product of products) {
        await destroyImages(product.images);
    }

    return res.status(200).json({
        success: true,
        message: `${result.deletedCount} product(s) deleted`
    })
}

exports.getAdminProducts = async (req, res, next) => {

    const products = await Product.find();
    if (!products) {
        return res.status(404).json({
            success: false,
            message: 'Products not found'
        })
    }
    return res.status(200).json({
        success: true,
        products
    })

}

const filter = require('../utils/badWords');

exports.createProductReview = async (req, res, next) => {
    const { rating, comment, productId } = req.body;
    
    // Apply bad-words filter to the comment
    const cleanComment = filter.clean(comment);
    console.log('[createProductReview] original:', comment, '-> clean:', cleanComment);
    
    const review = {
        user: req.user._id,
        name: req.user.name,
        rating: Number(rating),
        comment: cleanComment
    }
    const product = await Product.findById(productId);
    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        })
    }

    // Only allow reviews from users who actually purchased this product
    const userOrders = await Order.find({ user: req.user._id }).select('_id');
    let purchased = false;
    for (const o of userOrders) {
        const detail = await OrderDetail.findOne({ orderId: o._id, product: productId });
        if (detail) {
            purchased = true;
            break;
        }
    }
    if (!purchased) {
        return res.status(403).json({
            success: false,
            message: 'You can only review products you have ordered.'
        })
    }

    const isReviewed = product.reviews.find(
        r => r.user.toString() === req.user._id.toString()
    )
    if (isReviewed) {
        product.reviews.forEach(review => {
            if (review.user.toString() === req.user._id.toString()) {
                review.comment = cleanComment;
                review.rating = rating;
            }
        })
    } else {
        product.reviews.push(review);
        product.numOfReviews = product.reviews.length
    }
    product.ratings = product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length
    await product.save({ validateBeforeSave: false });
    if (!product)
        return res.status(400).json({
            success: false,
            message: 'review not posted'
        })
    return res.status(200).json({
        success: true
    })
}

exports.getProductReviews = async (req, res, next) => {
    const product = await Product.findById(req.query.id);
    res.status(200).json({
        success: true,
        reviews: product.reviews
    })
}

/* Admin: list every review across all products (newest first) */
exports.getAllReviews = async (req, res, next) => {
    const products = await Product.find({ 'reviews.0': { $exists: true } }).select('name images reviews');
    const allReviews = [];
    products.forEach(product => {
        product.reviews.forEach(review => {
            allReviews.push({
                _id: review._id,
                rating: review.rating,
                comment: review.comment,
                name: review.name,
                user: review.user,
                product: product.name,
                productId: product._id,
                image: product.images && product.images[0] ? product.images[0].url : ''
            });
        });
    });
    allReviews.sort((a, b) => String(b._id).localeCompare(String(a._id)));
    res.status(200).json({
        success: true,
        reviews: allReviews,
        count: allReviews.length
    });
}

exports.deleteReview = async (req, res, next) => {
    const product = await Product.findById(req.query.productId);
    const reviews = product.reviews.filter(review => review._id.toString() !== req.query.id.toString());
    const numOfReviews = reviews.length;

    const ratings = reviews.length > 0
        ? reviews.reduce((acc, item) => item.rating + acc, 0) / reviews.length
        : 0

    await Product.findByIdAndUpdate(req.query.productId, {
        reviews,
        ratings,
        numOfReviews
    }, {
        new: true,
        runValidators: true,
        useFindAndModify: false
    })

    return res.status(200).json({
        success: true
    })
}
