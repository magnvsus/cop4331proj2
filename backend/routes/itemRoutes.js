const express = require('express');
const multer = require('multer');
const router = express.Router();
const itemController = require('../controllers/itemController');
const protect = require('../middleware/authMiddleware');

// Buffered in memory (not written to disk) since uploadImage pipes the
// buffer straight through sharp to compress before saving.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap on the original, pre-compression file
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    }
});

// Wraps multer's callback-style error handling so failures (bad file type,
// too large) come back as the same { error: '...' } JSON shape as the rest
// of the API, instead of Express's default HTML error page.
function handleUpload(req, res, next) {
    upload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}

// Protected by JWT
router.post('/additem', protect, itemController.createItem);
router.post('/searchitems', protect, itemController.searchItem);
router.patch('/updateitem/:id', protect, itemController.updateItem);
router.delete('/deleteitem/:id', protect, itemController.deleteItem);
// Image upload route -- accepts a single "image" field, compresses it, and
// returns a /uploads/<file> URL to store as the item's pictureURL.
router.post('/upload', protect, handleUpload, itemController.uploadImage);

module.exports = router;