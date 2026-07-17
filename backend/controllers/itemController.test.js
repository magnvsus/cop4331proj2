const Item = require('../models/Item');
const fs = require('fs/promises');
const crypto = require('crypto');
const sharp = require('sharp');
const itemController = require('./itemController');
const { mockRequest, mockResponse } = require('../testUtils/expressMocks');

jest.mock('../models/Item');
jest.mock('fs/promises');
jest.mock('crypto');
jest.mock('sharp');

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
  beforeEach(() => {
    fs.unlink.mockResolvedValue(undefined);
  });

  it('returns 404 when the item does not belong to the user', async () => {
    Item.findOne.mockResolvedValue(null);
    const req = mockRequest({ params: { id: 'i1' }, body: { amount: 5 }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(Item.findOne).toHaveBeenCalledWith({ _id: 'i1', accountID: 'u1' });
    expect(Item.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates and returns the item on success', async () => {
    const previous = { _id: 'i1', amount: 1, pictureURL: '' };
    const updated = { _id: 'i1', amount: 5, pictureURL: '' };
    Item.findOne.mockResolvedValue(previous);
    Item.findOneAndUpdate.mockResolvedValue(updated);
    const req = mockRequest({ params: { id: 'i1' }, body: { amount: 5 }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(Item.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'i1', accountID: 'u1' },
      { amount: 5 },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ item: updated, error: '' });
  });

  it('deletes the old uploaded photo when it is replaced by a new one', async () => {
    const previous = { _id: 'i1', pictureURL: '/uploads/old.jpg' };
    const updated = { _id: 'i1', pictureURL: '/uploads/new.jpg' };
    Item.findOne.mockResolvedValue(previous);
    Item.findOneAndUpdate.mockResolvedValue(updated);
    const req = mockRequest({ params: { id: 'i1' }, body: { pictureURL: '/uploads/new.jpg' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('old.jpg'));
  });

  it('deletes the old photo even when it was stored as an absolute URL', async () => {
    // Regression test: the frontend used to save pictureURL as a fully
    // resolved absolute URL instead of the relative path the server
    // returned, which silently broke cleanup since it didn't start with
    // "/uploads/". deleteLocalUpload should still recognize it as ours.
    const previous = { _id: 'i1', pictureURL: 'https://aecm.site/uploads/old.jpg' };
    const updated = { _id: 'i1', pictureURL: '/uploads/new.jpg' };
    Item.findOne.mockResolvedValue(previous);
    Item.findOneAndUpdate.mockResolvedValue(updated);
    const req = mockRequest({ params: { id: 'i1' }, body: { pictureURL: '/uploads/new.jpg' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('old.jpg'));
  });

  it('does not delete an external pictureURL (e.g. seeded demo images)', async () => {
    const previous = { _id: 'i1', pictureURL: 'https://images.unsplash.com/photo.jpg' };
    const updated = { _id: 'i1', pictureURL: '/uploads/new.jpg' };
    Item.findOne.mockResolvedValue(previous);
    Item.findOneAndUpdate.mockResolvedValue(updated);
    const req = mockRequest({ params: { id: 'i1' }, body: { pictureURL: '/uploads/new.jpg' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('returns a 500 when the update fails', async () => {
    Item.findOne.mockResolvedValue({ _id: 'i1', pictureURL: '' });
    Item.findOneAndUpdate.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ params: { id: 'i1' }, body: {}, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.updateItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('itemController.deleteItem', () => {
  beforeEach(() => {
    fs.unlink.mockResolvedValue(undefined);
  });

  it('returns 404 when the item does not belong to the user', async () => {
    Item.findOneAndDelete.mockResolvedValue(null);
    const req = mockRequest({ params: { id: 'i1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.deleteItem(req, res);

    expect(Item.findOneAndDelete).toHaveBeenCalledWith({ _id: 'i1', accountID: 'u1' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes the item on success', async () => {
    Item.findOneAndDelete.mockResolvedValue({ _id: 'i1', pictureURL: '' });
    const req = mockRequest({ params: { id: 'i1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Item successfully deleted', error: '' });
  });

  it('cleans up the uploaded photo file when deleting an item that has one', async () => {
    Item.findOneAndDelete.mockResolvedValue({ _id: 'i1', pictureURL: '/uploads/photo.jpg' });
    const req = mockRequest({ params: { id: 'i1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.deleteItem(req, res);

    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('photo.jpg'));
  });

  it('returns a 500 when deletion fails', async () => {
    Item.findOneAndDelete.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ params: { id: 'i1' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('itemController.uploadImage', () => {
  let toFile;

  beforeEach(() => {
    fs.mkdir.mockResolvedValue(undefined);
    crypto.randomUUID.mockReturnValue('fixed-uuid');

    toFile = jest.fn().mockResolvedValue(undefined);
    const jpeg = jest.fn().mockReturnValue({ toFile });
    const resize = jest.fn().mockReturnValue({ jpeg });
    const rotate = jest.fn().mockReturnValue({ resize });
    sharp.mockReturnValue({ rotate });
  });

  it('rejects when no file was uploaded', async () => {
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await itemController.uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No file was uploaded' });
  });

  it('compresses the upload and returns its relative URL', async () => {
    const req = { ...mockRequest({ user: { userId: 'u1' } }), file: { buffer: Buffer.from('fake-image'), mimetype: 'image/jpeg' } };
    const res = mockResponse();

    await itemController.uploadImage(req, res);

    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('uploads'), { recursive: true });
    expect(sharp).toHaveBeenCalledWith(req.file.buffer);
    expect(toFile).toHaveBeenCalledWith(expect.stringContaining('fixed-uuid.jpg'));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ pictureURL: '/uploads/fixed-uuid.jpg', error: '' });
  });

  it('returns a 500 when compression fails', async () => {
    toFile.mockRejectedValue(new Error('corrupt image'));
    const req = { ...mockRequest({ user: { userId: 'u1' } }), file: { buffer: Buffer.from('bad'), mimetype: 'image/jpeg' } };
    const res = mockResponse();

    await itemController.uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
