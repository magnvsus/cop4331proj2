const express = require('express')
const router = express.Router();

const authController = require('../controllers/authController');
const protect = require('../middleware/authMiddleware');

// Register Route
router.post('/register', authController.register);

// Login Route
router.post('/login', authController.login);

// Update Banner Route
router.patch('/banner', protect, authController.updateBanner);

// Delete Account Route
router.delete('/account', protect, authController.deleteAccount);

// export so that server.js can import
module.exports = router;