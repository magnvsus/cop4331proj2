const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    accountID: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    categoryID: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Category', 
        required: false
    },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    unit: { type: String, trim: true, default: 'units' },
    amount: { type: Number, default: 0, min: 0 },
    pictureURL: { type: String },
    lowStockThreshold: { type: Number, default: 5, min: 0}
},
{ timestamps: true }
);

itemSchema.index({ accountID: 1, categoryID: 1});

module.exports = mongoose.model('Item', itemSchema);