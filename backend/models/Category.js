const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    accountID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }
});

module.exports = mongoose.model('Category', categorySchema);