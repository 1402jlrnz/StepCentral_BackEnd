// Assigns multiple real product photos (up to 4 multi-angle views) to each shoe in the store.
// Downloads the source images with browser headers and uploads them into Step Central's
// Cloudinary bucket, ensuring stable hosting, proper public_ids, and CDN caching.
// Run: node addProductImages.js

const dns = require('dns');
// Ensure reliable DNS resolution for MongoDB Atlas SRV records on Windows
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) { /* ignore */ }

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const cloudinary = require('cloudinary');
const connectDatabase = require('./config/database');
const Product = require('./models/product');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Product name -> 4 multi-angle image URLs (side profile, angled, top/detail, outsole/heel)
const sources = {
    // ---------------- Lifestyle ----------------
    "Nike Air Force 1 '07": [
        "https://www.nike.ae/dw/image/v2/BDVB_PRD/on/demandware.static/-/Sites-akeneo-master-catalog/default/dw651db905/nk/e6d/a/4/1/f/a/e6da41fa_1be4_4ce5_b89c_22be4f1f02d4.jpg",
        "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/33533fe2-1157-4001-896e-1803b30659c8/air-force-1-07-shoes-HvZlfx.png",
        "https://media.sivasdescalzo.com/media/catalog/product/D/X/DX5883-100_sivasdescalzo-Nike-W_AIR_FORCE_1_07_FLYEASE-1684486991-2.jpg?quality=70&auto=webp&fit=bounds&width=950",
        "https://static.nike.com/a/images/t_web_pw_592_v2/f_auto/9fffd0e4-2c1a-4963-8d69-e8582131797b/AIR+FORCE+1+'07+WB.png"
    ],
    "Adidas Samba OG": [
        "https://assets.adidas.com/images/w_1880,f_auto,q_auto/65be906afc06467f8ff483e9a3b38383_9366/IE3439_01_standard.jpg",
        "https://d2bzx2vuetkzse.cloudfront.net/images_without_background/2b4e9444-0655-4ee6-b60d-0aa4e892af8f.png",
        "https://media.endclothing.com/media/catalog/product/1/3/13-06-2023-LB_B75806_m1_1.jpg",
        "https://assets.adidas.com/images/w_1880,f_auto,q_auto/671c62b81c3448e980aca8bf01181a93_9366/B75806_41_detail.jpg"
    ],
    "New Balance 550": [
        "https://cdn.lesitedelasneaker.com/wp-content/images/2023/01/new-balance-550-triple-white-bb550www-pic02-1100x772.jpg",
        "https://cdn.clothbase.com/uploads/9e2c77f7-038d-4b33-86cb-8cc5031db272/white-550-sneakers.jpg",
        "https://nb.scene7.com/is/image/NB/bb550www_nb_02_i?$dw_detail_main_lg$&bgc=f1f1f1&layer=1&bgcolor=f1f1f1&blendMode=mult&scale=10&wid=1600&hei=1600",
        "https://cdn-images.farfetch-contents.com/19/92/24/87/19922487_44685019_1000.jpg"
    ],
    "ASICS GEL-1130": [
        "https://images.asics.com/is/image/asics/1201B019_100_SR_RT_GLB?$sfcc-product$&fmt=jpg&wid=683&hei=512",
        "https://i8.amplience.net/i/jpl/jd_759599_a?qlt=92",
        "https://cdn.clothbase.com/uploads/bf648fec-16b7-42cf-a6fb-02b21ba19790/27-06-2023-AJ_1202A164-110_1_1.jpg",
        "https://images.novelship.com/product/asics_gel_1130__white_cloud_grey__1201a256_118_2_57325.jpeg"
    ],
    "Nike Dunk Low Retro": [
        "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/79a35c4b-23ec-4d9e-a2f3-bb0049f96fbd/NIKE+DUNK+LOW+RETRO.png",
        "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/3f707471-1507-43a6-aa89-dc6af7fc5978/NIKE+DUNK+LOW+RETRO.png",
        "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/b8083f2f-0933-4c11-9438-5497d751ce62/NIKE+DUNK+LOW+RETRO.png",
        "https://static.nike.com/a/images/t_web_pw_592_v2/f_auto/ae01c2a0-b415-404a-93e3-088b511cb192/NIKE+DUNK+LOW+RETRO.png"
    ],
    "New Balance 1906L Silver": [
        "https://cdn.media.amplience.net/i/office/4935997275_pr1.jpg?$highres$&fmt=auto&qlt=default&fmt.jpeg.interlaced=true",
        "https://sneakerbardetroit.com/wp-content/uploads/2024/04/New-Balance-1906L-Loafer-Metallic-Silver-1-1068x695.jpg",
        "https://sneakernews.com/wp-content/uploads/2024/04/new-balance-1906-loafer-silver-10.jpg",
        "https://image.807garage.com/content/uploads/2025/4/new-balance-1906l-metallic-silver-1.jpg"
    ],

    // ---------------- Running ----------------
    "Nike Air Zoom Pegasus 41": [
        "https://static.nike.com/a/images/t_web_pw_592_v2/f_auto/9d45f2da-011a-416f-84dd-6c1cb740d4b8/W+AIR+ZOOM+PEGASUS+41.png",
        "https://static.nike.com/a/images/t_web_pw_592_v2/f_auto/887859e5-9b50-4c19-a9bb-733f55f88cb2/AIR+ZOOM+PEGASUS+41.png",
        "https://static.nike.com/a/images/t_web_pw_592_v2/f_auto/b7a3bd94-156c-4132-bc5f-0b62d323f714/W+AIR+ZOOM+PEGASUS+41.png",
        "https://s1.dswcdn.com/uploads/Nike_Zoom_Lunar_Shoes/Air_Zoom_Pegasus_41/Nike_Air_Zoom_Pegasus_41_Pure_Platinum_Metallic_Silver_White_FD2722-102_P1.jpg"
    ],
    "Adidas Ultraboost Light": [
        "https://assets.adidas.com/images/w_1880,f_auto,q_auto/efd28e028baf4d6e934c9e258d5993fc_9366/ID8813_HM1.jpg",
        "https://assets.adidas.com/images/w_600,f_auto,q_auto/f97d22f5b3af403ab63a5ba083e9edef_9366/Ultraboost_Light_Shoes_White_GY9350.jpg",
        "https://startfitness.co.uk/cdn/shop/products/adidas-Ultra-Boost-Light-GY9352.jpg?v=1682479254",
        "https://assets.adidas.com/images/h_840,f_auto,q_auto,fl_lossy,c_fill,g_auto/29a0e7eb0ad74265a04fe10a302b69da_9366/Ultraboost_Light_Shoes_White_ID3285_HM1.jpg"
    ],
    "ASICS Gel-Kayano 31": [
        "https://images.asics.com/is/image/asics/1012B670_101_SR_RT_GLB?$sfcc-product$",
        "https://images.asics.com/is/image/asics/1011B867_100_SR_RT_GLB?$sfcc-product$",
        "https://shop62610.sfstatic.io/upload_dir/shop/Asics-Gel-Kayano-Concrete-2.jpg",
        "https://media.cnn.com/api/v1/images/stellar/prod/asics-women-s-gel-kayano-31.jpg?c=16x9&q=h_720,w_1280,c_fill"
    ],
    "New Balance Fresh Foam X 1080v13": [
        "https://www.popcornstore.com.hk/cdn/shop/files/m1080w13_nb_03_i_clipped_rev_1.jpg?v=1709791333",
        "https://www.paceathletic.com/cdn/shop/files/MensNewBalanceFreshFoamX1080v13-White_LightSilverMetallic.jpg?v=1724377374&width=1701",
        "https://cdna.lystit.com/photos/amazon/8fb40ca9/new-balance-WhiteLight-Silver-Metallic-Fresh-Foam-X-1080v13.jpeg",
        "https://static.sneakerjagers.com/products/660x660/547562.jpg"
    ],
    "Nike ZoomX Invincible 3": [
        "https://sneakernews.com/wp-content/uploads/2022/11/Nike-ZoomX-Invincible-Run-Flyknit-3-DR2615-100-1.jpg",
        "https://cdna.lystit.com/1200/630/tr/photos/kickscrew/8a370c09/nike-white-Wmns-Zoomx-Invincible-3-Wide.jpeg",
        "https://img.joomcdn.net/3b45a21ded1b4cd2209438d5a8d3dfa58a256e5c_original.jpeg",
        "https://cdna.lystit.com/1040/1300/n/photos/houseoffraser/203c6f76/nike-Light-Bone-Zoomx-Invincible-3-Flyknit-Running-Shoes.jpeg"
    ],
    "Adidas Adizero Evo SL i": [
        "https://assets.adidas.com/images/w_1880,f_auto,q_auto/10b807c147014e5b8a8acc1ade410450_9366/JH6206_09_standard.jpg",
        "https://assets.adidas.com/images/w_1880,f_auto,q_auto/d06f2930372c42ce9737e823874a0b32_9366/JH6208_04_standard.jpg",
        "https://assets.adidas.com/images/w_1880,f_auto,q_auto/c2e7843b6be64924943406cfaa899b82_9366/JH6206_01_00_standard.jpg",
        "https://assets.adidas.com/images/w_940,f_auto,q_auto/482606b2f42b4a7b886b01ff2fabaa74_9366/JH6206_02_standard.jpg"
    ],

    // ---------------- Basketball ----------------
    "Nike LeBron 22": [
        "https://d3pnpe87i1fkwu.cloudfront.net/IMG/024749-nike-lebron-22-fz1094-101_2048x2048.png",
        "https://cdn2.basket4ballers.com/256908-thickbox_default/nike-lebron-22-crown-jewel.jpg",
        "https://cdn2.basket4ballers.com/256914-thickbox_default/nike-lebron-22-crown-jewel.jpg",
        "https://d3pnpe87i1fkwu.cloudfront.net/IMG/025127-nike-lebron-22-hv8454-100_2048x2048.png"
    ],
    "Adidas Harden Vol. 8": [
        "https://sneakerbardetroit.com/wp-content/uploads/2024/03/adidas-Harden-Vol-8-White-Party-IE2696.jpeg",
        "https://media.sivasdescalzo.com/media/catalog/product/I/E/IE2696_sivasdescalzo-adidas-HARDEN_VOLUME_8-1711367132-1.jpg",
        "https://assets.adidas.com/images/h_840,f_auto,q_auto,fl_lossy,c_fill,g_auto/019e28a8c3564391b36d6b32ad4d8e14_9366/Harden_Volume_8_Shoes_Grey_IG6649_01_00_standard.jpg",
        "https://assets.adidas.com/images/h_840,f_auto,q_auto,fl_lossy,c_fill,g_auto/dd97b5fe9f64469986a17edb3c8c5cc1_9366/Harden_Volume_8_Shoes_Yellow_IG6589_01_00_standard.jpg"
    ],
    "ASICS GELHOOP V17": [
        "https://images.asics.com/is/image/asics/1063A101_101_SR_RT_GLB?$sfcc-product$&fmt=jpg&wid=683&hei=512",
        "https://images.asics.com/is/image/asics/1063A096_104_SL_LT_GLB?$sfcc-product$",
        "https://images.asics.com/is/image/asics/1063A096_100_SR_RT_GLB?$sfcc-product$&fmt=jpg&wid=683&hei=512",
        "https://images.asics.com/is/image/asics/1063A098_100_SR_RT_GLB?$sfcc-product$"
    ],
    "New Balance KAWHI 4": [
        "https://d3pnpe87i1fkwu.cloudfront.net/IMG/023263-new-balance-kawhi-4-bbklsgd4_2048x2048.png",
        "https://sneakernews.com/wp-content/uploads/2024/04/new-balance-kawhi-iv-4-transcend-the-game-3.jpg?w=1200",
        "https://d3pnpe87i1fkwu.cloudfront.net/IMG/023281-new-balance-kawhi-4-bbklsbr4_1170x1170.png",
        "https://d3pnpe87i1fkwu.cloudfront.net/IMG/023262-new-balance-kawhi-4-bbklsgd4_2048x2048.png"
    ],
    "Nike KD 18": [
        "https://static.nike.com/a/images/t_web_pw_592_v2/f_auto/6d99e9f9-63cf-488f-9837-3c9ae56e30b1/KD18.png",
        "https://cdn1.basket4ballers.com/291597-large_default/nike-kd-18-triple-white-im0634-105.jpg",
        "https://d3pnpe87i1fkwu.cloudfront.net/IMG/026587-nike-kd-18-hv1992-001_2048x2048.png",
        "https://sneakerbardetroit.com/wp-content/uploads/2025/08/nike-kd-18-white-navy-im0634-101-2.jpg"
    ]
};

const uploadBufferToCloudinary = (buffer, publicId) => new Promise((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream(
        {
            folder: 'products',
            public_id: publicId,
            overwrite: true,
            quality: 'auto',
            fetch_format: 'auto'
        },
        (error, result) => {
            if (error) return reject(error);
            resolve(result);
        }
    );
    stream.end(buffer);
});

async function downloadImageBuffer(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        },
        signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuf = await resp.arrayBuffer();
    return Buffer.from(arrayBuf);
}

(async () => {
    try {
        await connectDatabase();

        let totalUploaded = 0;
        let totalFailed = 0;

        for (const [name, urls] of Object.entries(sources)) {
            const product = await Product.findOne({ name });
            if (!product) {
                console.log(`  ? product not found in database: ${name}`);
                continue;
            }

            console.log(`\nProcessing: ${name} (${urls.length} images)...`);
            const productImages = [];

            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                const publicId = `${slug(name)}-${i + 1}`;

                try {
                    const buf = await downloadImageBuffer(url);
                    const res = await uploadBufferToCloudinary(buf, publicId);
                    productImages.push({ public_id: res.public_id, url: res.secure_url });
                    totalUploaded++;
                    console.log(`  ✓ [${i + 1}/${urls.length}] Cloudinary: ${res.secure_url}`);
                } catch (err) {
                    console.log(`  ~ [${i + 1}/${urls.length}] Fallback external: ${err.message}`);
                    productImages.push({ public_id: `external/${publicId}`, url });
                    totalFailed++;
                }
            }

            product.images = productImages;
            await product.save();
            console.log(`  ➜ Saved ${product.name} with ${product.images.length} pictures.`);
        }

        console.log(`\n========================================`);
        console.log(`All done! Uploaded to Cloudinary: ${totalUploaded}, External fallbacks: ${totalFailed}`);
        console.log(`========================================`);
        process.exit(0);
    } catch (err) {
        console.error('addProductImages failed:', err);
        process.exit(1);
    }
})();
