const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const protect = require('../middleware/authMiddleware');

// Protected by JWT
router.post('/additem', protect, itemController.createItem);
router.post('/searchitems', protect, itemController.searchItem);
router.patch('/updateitem/:id', protect, itemController.updateItem);
router.delete('/deleteitem/:id', protect, itemController.deleteItem);

module.exports = router;