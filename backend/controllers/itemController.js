const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const sharp = require('sharp');
const Item = require('../models/Item');
const { UPLOADS_DIR, deleteLocalUpload } = require('../utils/localUploads');

// Create
exports.createItem = async (req, res) => {
    try{
        const { name, sku, unit, amount, pictureURL, lowStockThreshold, categoryID } = req.body;

        const newItem = new Item({
            accountID: req.user.userId,
            categoryID,
            name,
            sku,
            unit,
            amount,
            pictureURL,
            lowStockThreshold
        });

        const savedItem = await newItem.save();
        res.status(201).json({ item: savedItem, error: ' '});
    } catch (error) {
        res.status(500).json({ error: 'Failed to create item', details: error.message});
    }
};

// Read / Search
exports.searchItem = async (req, res) => {
    try{
        const { search } = req.body;
        const userID = req.user.userId;

        //Find items that match search
        const query = {
            accountID: userID,
            name: { $regex: search || '', $options: 'i' }
        };

        const items = await Item.find(query);
        res.status(200).json({ results: items, error: '' });
    } catch (error) {
       res.status(500).json({ error: 'Failed to search items', details: error.message });
    }
};

// Update
exports.updateItem = async (req, res) => {
    try{
        const itemID = req.params.id;
        const userID = req.user.userId;
        const updates = req.body;

        //find an item and check if it belongs to user
        const previousItem = await Item.findOne({ _id: itemID, accountID: userID });
        if (!previousItem) {
            return res.status(404).json({ error: 'Item not found or unauthorized'});
        }

        const updatedItem = await Item.findOneAndUpdate(
            { _id: itemID, accountID: userID},
            updates,
            { new: true, runValidators: true}
        );

        // If this update replaced the photo, clean up the old upload so it
        // doesn't sit around on disk forever.
        if (Object.prototype.hasOwnProperty.call(updates, 'pictureURL') && updates.pictureURL !== previousItem.pictureURL) {
            await deleteLocalUpload(previousItem.pictureURL);
        }

        res.status(200).json({ item: updatedItem, error: '' });
    } catch (error) {
       res.status(500).json({ error: 'Failed to update item', details: error.message });
    }
};

// Delete
exports.deleteItem = async (req, res) => {
    try{
        const itemID = req.params.id;
        const userID = req.user.userId;

        //find an item and check if it belongs to user
        const deletedItem = await Item.findOneAndDelete({ _id: itemID, accountID: userID});

        if (!deletedItem) {
            return res.status(404).json({ error: 'Item not found or unathorized' });
        }

        await deleteLocalUpload(deletedItem.pictureURL);

        res.status(200).json({ message: 'Item successfully deleted', error: '' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete item', details: error.message });
    }
};

// Image Upload
exports.uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file was uploaded' });
        }

        await fs.mkdir(UPLOADS_DIR, { recursive: true });

        const filename = `${crypto.randomUUID()}.jpg`;

        // Resize/compress so item photos never bloat storage or requests --
        // capped at 1200px on the long edge, re-encoded as JPEG. `rotate()`
        // with no args applies the image's own EXIF orientation, since phone
        // camera photos are otherwise saved sideways.
        await sharp(req.file.buffer)
            .rotate()
            .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 75 })
            .toFile(path.join(UPLOADS_DIR, filename));

        res.status(200).json({ pictureURL: `/uploads/${filename}`, error: '' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to upload image', details: error.message });
    }
};
