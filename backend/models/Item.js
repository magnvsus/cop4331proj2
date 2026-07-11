const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    accountID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    categoryID: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true },
    amount: { type: Number, default: 0 },
    pictureURL: { type: String },
    lowStockThreshold: { type: Number, required: true }
});

module.exports = mongoose.model('Item', itemSchema);