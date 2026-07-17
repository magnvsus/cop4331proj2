const Item = require('../models/Item');

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
        const updatedItem = await Item.findOneAndUpdate(
            { _id: itemID, accountID: userID},
            updates,
            { new: true, runValidators: true}
        );

        if (!updatedItem) {
            return res.status(404).json({ error: 'Item not found or unauthorized'});
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

        res.status(200).json({ message: 'Item successfully deleted', error: '' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete item', details: error.message });
    }
};
