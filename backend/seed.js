const { setServers } = require('node:dns/promises');
setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('./models/User');
const Category = require('./models/Category');
const Item = require('./models/Item');

async function seedDatabase() {
    try {
        console.log('Connecting to Atlas database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected! Clearing out any old data...');

        // Clear out the database so we have a fresh start
        await User.deleteMany({});
        await Category.deleteMany({});
        await Item.deleteMany({});

        console.log('Creating Demo Account... (Completing CLP-72)');
        const demoUser = new User({
            email: 'demo@coffeeshop.com',
            password: 'hashed_password_placeholder', // Kaden will handle real hashing later
            isVerified: true,
            bannerImage: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=800'
        });
        await demoUser.save();

        console.log('Creating Categories... (Completing CLP-71)');
        const catDairy = new Category({ accountID: demoUser._id, name: 'Dairy & Alternatives' });
        const catSyrup = new Category({ accountID: demoUser._id, name: 'Syrups' });
        const catBeans = new Category({ accountID: demoUser._id, name: 'Espresso Beans' });
        await Category.insertMany([catDairy, catSyrup, catBeans]);

        console.log('Creating Inventory Items... (Completing CLP-70)');
        const items = [
            {
                accountID: demoUser._id, categoryID: catDairy._id,
                name: 'Whole Milk', amount: 12, lowStockThreshold: 4,
                pictureURL: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400'
            },
            {
                accountID: demoUser._id, categoryID: catDairy._id,
                name: 'Oat Milk', amount: 3, lowStockThreshold: 5, // This one will trigger the low-stock alert!
                pictureURL: 'https://images.unsplash.com/photo-1600740836585-1f92e70e7e1f?w=400'
            },
            {
                accountID: demoUser._id, categoryID: catSyrup._id,
                name: 'Vanilla Syrup', amount: 8, lowStockThreshold: 2,
                pictureURL: 'https://images.unsplash.com/photo-1558292837-184cf43ba945?w=400'
            },
            {
                accountID: demoUser._id, categoryID: catBeans._id,
                name: 'Dark Roast Espresso', amount: 20, lowStockThreshold: 10,
                pictureURL: 'https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=400'
            }
        ];
        await Item.insertMany(items);

        console.log('Seed complete! Data is live in the cloud.');
        process.exit();
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();