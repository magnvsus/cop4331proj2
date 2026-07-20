const Category = require('../models/Category');
const categoryController = require('./categoryController');
const { mockRequest, mockResponse } = require('../testUtils/expressMocks');

jest.mock('../models/Category');

describe('categoryController.createCategory', () => {
  it('rejects a missing name', async () => {
    const req = mockRequest({ body: {}, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Category name is required' });
  });

  it('creates a category scoped to the logged-in user', async () => {
    const saved = { _id: 'c1', accountID: 'u1', name: 'Dairy' };
    const save = jest.fn().mockResolvedValue(saved);
    Category.mockImplementation(function (data) {
      Object.assign(this, data);
      this.save = save;
    });

    const req = mockRequest({ body: { name: 'Dairy' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.createCategory(req, res);

    expect(Category).toHaveBeenCalledWith({ accountID: 'u1', name: 'Dairy' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ category: saved, error: '' });
  });

  it('reports a friendly error on a duplicate category name', async () => {
    const duplicateError = Object.assign(new Error('duplicate'), { code: 11000 });
    Category.mockImplementation(function () {
      this.save = jest.fn().mockRejectedValue(duplicateError);
    });

    const req = mockRequest({ body: { name: 'Dairy' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'You already have a category with this name.' });
  });

  it('returns a 500 on an unexpected error', async () => {
    Category.mockImplementation(function () {
      this.save = jest.fn().mockRejectedValue(new Error('db down'));
    });

    const req = mockRequest({ body: { name: 'Dairy' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.createCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('categoryController.searchCategories', () => {
  it('scopes the search to the logged-in user and matches by name', async () => {
    const categories = [{ _id: 'c1', name: 'Dairy' }];
    Category.find.mockResolvedValue(categories);

    const req = mockRequest({ body: { search: 'dai' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.searchCategories(req, res);

    expect(Category.find).toHaveBeenCalledWith({
      accountID: 'u1',
      name: { $regex: 'dai', $options: 'i' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ results: categories, error: '' });
  });

  it('returns a 500 when the lookup fails', async () => {
    Category.find.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ body: {}, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.searchCategories(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('categoryController.updateCategory', () => {
  it('rejects a missing name', async () => {
    const req = mockRequest({ params: { id: 'c1' }, body: {}, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.updateCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the category does not belong to the user', async () => {
    Category.findOneAndUpdate.mockResolvedValue(null);
    const req = mockRequest({ params: { id: 'c1' }, body: { name: 'Syrups' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.updateCategory(req, res);

    expect(Category.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'c1', accountID: 'u1' },
      { name: 'Syrups' },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates and returns the category on success', async () => {
    const updated = { _id: 'c1', accountID: 'u1', name: 'Syrups' };
    Category.findOneAndUpdate.mockResolvedValue(updated);
    const req = mockRequest({ params: { id: 'c1' }, body: { name: 'Syrups' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.updateCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ category: updated, error: '' });
  });

  it('reports a friendly error on a duplicate category name', async () => {
    Category.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const req = mockRequest({ params: { id: 'c1' }, body: { name: 'Syrups' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.updateCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'You already have a category with this name.' });
  });
});

describe('categoryController.deleteCategory', () => {
  it('returns 404 when the category does not belong to the user', async () => {
    Category.findOneAndDelete.mockResolvedValue(null);
    const req = mockRequest({ params: { id: 'c1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.deleteCategory(req, res);

    expect(Category.findOneAndDelete).toHaveBeenCalledWith({ _id: 'c1', accountID: 'u1' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes the category on success', async () => {
    Category.findOneAndDelete.mockResolvedValue({ _id: 'c1' });
    const req = mockRequest({ params: { id: 'c1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.deleteCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Category successfully deleted', error: '' });
  });

  it('returns a 500 when deletion fails', async () => {
    Category.findOneAndDelete.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ params: { id: 'c1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await categoryController.deleteCategory(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
