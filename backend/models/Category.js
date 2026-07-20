const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    accountID: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    name: { type: String, required: true, trim: true}
},
{ timestamps: true }
);

categorySchema.index({accountID: 1, name: 1 }, { unique: true});

module.exports = mongoose.model('Category', categorySchema);