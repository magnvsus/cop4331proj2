const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true},
    password: { type: String, required: true, select: false },
    isVerified: { type: Boolean, default: false },
    bannerImage: { type: String }
},
{ timestamps: true }
);

module.exports = mongoose.model('User', userSchema);