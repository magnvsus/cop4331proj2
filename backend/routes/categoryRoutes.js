// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const protect = require('../middleware/authMiddleware'); // Our JWT protector

// Secure all endpoints with the protect middleware
router.post('/addcategory', protect, categoryController.createCategory);
router.post('/searchcategories', protect, categoryController.searchCategories);
router.patch('/updatecategory/:id', protect, categoryController.updateCategory);
router.delete('/deletecategory/:id', protect, categoryController.deleteCategory);

module.exports = router;