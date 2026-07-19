const Item = require('../models/Item');
const itemController = require('./itemController');
const { mockRequest, mockResponse } = require('../testUtils/expressMocks');

jest.mock('../models/Item');

describe('itemController.createItem', () => {
  it('creates an item scoped to the logged-in user', async () => {
    const saved = { _id: 'i1', name: 'Whole Milk', amount: 12 };
    const save = jest.fn().mockResolvedValue(saved);
    Item.mockImplementation(function (data) {
      Object.assign(this, data);
      this.save = save;
    });

    const req = mockRequest({
      body: {
        name: 'Whole Milk',
        sku: 'DRY-001',
        unit: 'gallons',
        amount: 12,
        pictureURL: '',
        lowStockThreshold: 4,
        categoryID: 'cat1',
      },
      user: { userId: 'u1' },
    });
    const res = mockResponse();

    await itemController.createItem(req, res);

    expect(Item).toHaveBeenCalledWith({
      accountID: 'u1',
      categoryID: 'cat1',
      name: 'Whole Milk',
      sku: 'DRY-001',
      unit: 'gallons',
      amount: 12,
      pictureURL: '',
      lowStockThreshold: 4,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ item: saved, error: ' ' });
  });

  it('returns a 500 when saving fails', async () => {
    Item.mockImplementation(function () {
      this.save = jest.fn().mockRejectedValue(new Error('db down'));
    });
    const req = mockRequest({ body: { name: 'x' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.createItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('itemController.searchItem', () => {
  it('scopes the search to the logged-in user and matches by name', async () => {
    const items = [{ _id: 'i1', name: 'Whole Milk' }];
    Item.find.mockResolvedValue(items);

    const req = mockRequest({ body: { search: 'milk' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.searchItem(req, res);

    expect(Item.find).toHaveBeenCalledWith({
      accountID: 'u1',
      name: { $regex: 'milk', $options: 'i' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ results: items, error: '' });
  });

  it('returns a 500 when the lookup fails', async () => {
    Item.find.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ body: {}, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.searchItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('itemController.updateItem', () => {
  it('returns 404 when the item does not belong to the user', async () => {
    Item.findOneAndUpdate.mockResolvedValue(null);
    const req = mockRequest({ params: { id: 'i1' }, body: { amount: 5 }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(Item.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'i1', accountID: 'u1' },
      { amount: 5 },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates and returns the item on success', async () => {
    const updated = { _id: 'i1', amount: 5 };
    Item.findOneAndUpdate.mockResolvedValue(updated);
    const req = mockRequest({ params: { id: 'i1' }, body: { amount: 5 }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ item: updated, error: '' });
  });

  it('returns a 500 when the update fails', async () => {
    Item.findOneAndUpdate.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ params: { id: 'i1' }, body: {}, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('itemController.deleteItem', () => {
  it('returns 404 when the item does not belong to the user', async () => {
    Item.findOneAndDelete.mockResolvedValue(null);
    const req = mockRequest({ params: { id: 'i1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.deleteItem(req, res);

    expect(Item.findOneAndDelete).toHaveBeenCalledWith({ _id: 'i1', accountID: 'u1' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes the item on success', async () => {
    Item.findOneAndDelete.mockResolvedValue({ _id: 'i1' });
    const req = mockRequest({ params: { id: 'i1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Item successfully deleted', error: '' });
  });

  it('returns a 500 when deletion fails', async () => {
    Item.findOneAndDelete.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ params: { id: 'i1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
