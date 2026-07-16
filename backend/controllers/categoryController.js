const Category = require('../models/Category');

// Create
exports.createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.userId;

        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        const newCategory = new Category({
            accountID: userId,
            name
        });

        const savedCategory = await newCategory.save();
        res.status(201).json({ category: savedCategory, error: '' });
    } catch (error) {
        // Catches duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({ error: 'You already have a category with this name.' });
        }
        
        res.status(500).json({ error: 'Failed to create category', details: error.message });
    }
};

// Read / Search
exports.searchCategories = async (req, res) => {
    try {
        const { search } = req.body;
        const userId = req.user.userId;
  
        const query = {
            accountID: userId,
            name: { $regex: search || '', $options: 'i' } // Case-insensitive search
        };
  
        const categories = await Category.find(query);
        res.status(200).json({ results: categories, error: '' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories', details: error.message });
    }
};

// Update
exports.updateCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const userId = req.user.userId;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        const updatedCategory = await Category.findOneAndUpdate(
            { _id: categoryId, accountID: userId },
            { name },
            { new: true, runValidators: true }
        );
  
    if (!updatedCategory) {
        return res.status(404).json({ error: 'Category not found or unauthorized' });
    }
  
      res.status(200).json({ category: updatedCategory, error: '' });
    } catch (error) {
      // Catches duplicate key errors
        if (error.code === 11000) {
            return res.status(400).json({ error: 'You already have a category with this name.' });
        }
  
      res.status(500).json({ error: 'Failed to update category', details: error.message });
    }
};

// Delete
exports.deleteCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const userId = req.user.userId;
  
        // Find the category and ensure it belongs to the logged-in user
        const deletedCategory = await Category.findOneAndDelete({ _id: categoryId, accountID: userId });
  
        if (!deletedCategory) {
            return res.status(404).json({ error: 'Category not found or unauthorized' });
        }
      
        res.status(200).json({ message: 'Category successfully deleted', error: '' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete category', details: error.message });
    }
  };