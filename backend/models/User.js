const mongoose = require('mongoose');

// Cosmetic, per-account dashboard settings (company name/type, manager name,
// brand accent color). Kept as an explicit sub-schema -- rather than a plain
// Mixed/object field -- so Mongoose enforces the same length/format rules
// (e.g. accentColor must be a real hex code) no matter which controller
// writes to it.
const NOTIFICATION_FREQUENCIES = ['immediate', 'hourly', 'daily'];

const DEFAULT_SETTINGS = {
    companyName: 'Coffee Hour',
    businessType: 'Coffee shop',
    managerName: 'Alex Morgan',
    accentColor: '#a9642e',
    notificationsEnabled: false,
    notificationFrequency: 'immediate',
};

const settingsSchema = new mongoose.Schema(
    {
        companyName: { type: String, trim: true, maxlength: 60, default: DEFAULT_SETTINGS.companyName },
        businessType: { type: String, trim: true, maxlength: 60, default: DEFAULT_SETTINGS.businessType },
        managerName: { type: String, trim: true, maxlength: 60, default: DEFAULT_SETTINGS.managerName },
        accentColor: {
            type: String,
            trim: true,
            default: DEFAULT_SETTINGS.accentColor,
            match: [/^#[0-9a-fA-F]{6}$/, 'accentColor must be a hex color code (e.g. #a9642e)'],
        },
        // Low-stock push notifications (delivered on Android only). Kept
        // per-account like the rest of these settings so they follow the
        // user across devices.
        notificationsEnabled: { type: Boolean, default: DEFAULT_SETTINGS.notificationsEnabled },
        notificationFrequency: {
            type: String,
            enum: NOTIFICATION_FREQUENCIES,
            default: DEFAULT_SETTINGS.notificationFrequency,
        },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true},
    password: { type: String, required: true, select: false },
    isVerified: { type: Boolean, default: false },
    bannerImage: { type: String },
    settings: { type: settingsSchema, default: () => ({}) }
},
{ timestamps: true }
);

const User = mongoose.model('User', userSchema);
User.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
User.NOTIFICATION_FREQUENCIES = NOTIFICATION_FREQUENCIES;

module.exports = User;