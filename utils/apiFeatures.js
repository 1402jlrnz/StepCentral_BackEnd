require("../models/product");

class APIFeatures {
    constructor(query, queryStr) {
        this.query = query;
        this.queryStr = queryStr;
    }

    search() {
        const keyword = this.queryStr.keyword ? {
            name: {
                $regex: this.queryStr.keyword,
                $options: 'i'
            }
        } : {}

        this.query = this.query.find({ ...keyword });
        return this;
    }

    filter() {
        const queryCopy = { ...this.queryStr };
        // Removing fields from the query
        const removeFields = ['keyword', 'page']
        removeFields.forEach(el => delete queryCopy[el]);

        let priceFilter = {};
        if (queryCopy['price[gte]'] || queryCopy['price[lte]']) {
            priceFilter.price = {};
            if (queryCopy['price[gte]']) {
                priceFilter.price.$gte = Number(queryCopy['price[gte]']);
            }
            if (queryCopy['price[lte]']) {
                priceFilter.price.$lte = Number(queryCopy['price[lte]']);
            }
            delete queryCopy['price[gte]'];
            delete queryCopy['price[lte]'];
        }

        // Apply remaining filters as-is (e.g. category, ratings)
        const finalFilter = { ...priceFilter, ...queryCopy };
        // Ratings filter is a minimum (e.g. "4★ & up" -> products with rating >= 4),
        // so it must be a $gte comparison, not an exact equality match.
        if (finalFilter.ratings) {
            finalFilter.ratings = { $gte: Number(finalFilter.ratings) };
        }

        // Use the reviews array as the source of truth in case numOfReviews is stale.
        if (queryCopy.reviewFilter) {
            const rf = String(queryCopy.reviewFilter).trim();
            const reviewCount = { $size: { $ifNull: ['$reviews', []] } };
            if (rf === 'has') {
                finalFilter.$expr = { $gt: [reviewCount, 0] };
            } else if (rf === 'none') {
                finalFilter.$expr = { $eq: [reviewCount, 0] };
            } else if (rf.startsWith('min')) {
                const min = Number(rf.slice(3));
                if (Number.isInteger(min) && min > 0) {
                    finalFilter.$expr = { $gte: [reviewCount, min] };
                }
            }
            delete queryCopy.reviewFilter;
            delete finalFilter.reviewFilter;
        }

        this.query = this.query.find(finalFilter);
        return this;
    }

    pagination(resPerPage) {
        const currentPage = Number(this.queryStr.page) || 1;
        const skip = resPerPage * (currentPage - 1);

        this.query = this.query.limit(resPerPage).skip(skip);
        return this;
    }
}
module.exports = APIFeatures;
