const multer = require("multer");
const path = require("path");

// In-memory storage: uploaded files arrive as req.files[].buffer and are sent
// straight to Cloudinary from the controller (no temp files on disk).
module.exports = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 6 }, // 10MB per image, max 6 images
    fileFilter: (req, file, cb) => {
        let ext = path.extname(file.originalname).toLowerCase();
        const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
        if (!allowed.includes(ext)) {
            return cb(new Error("Unsupported file type!"), false);
        }
        cb(null, true);
    },
});
