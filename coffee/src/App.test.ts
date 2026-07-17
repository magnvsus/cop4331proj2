import { describe, it, expect } from 'vitest'
import { normalizeItem, mergeCategoryNames } from './App'
import type { ApiItem } from './api'

describe('normalizeItem', () => {
  const categoryNameById = { 'cat-1': 'Dairy', 'cat-2': 'Syrups' }

  it('maps a server item to the UI shape using the category lookup', () => {
    const apiItem: ApiItem = {
      _id: 'item-1',
      categoryID: 'cat-1',
      name: 'Whole Milk',
      sku: 'DRY-001',
      unit: 'gallons',
      amount: 12,
      pictureURL: 'https://example.com/milk.jpg',
      lowStockThreshold: 4,
    }

    expect(normalizeItem(apiItem, categoryNameById)).toEqual({
      id: 'item-1',
      name: 'Whole Milk',
      sku: 'DRY-001',
      category: 'Dairy',
      quantity: 12,
      unit: 'gallons',
      min: 4,
      image: 'https://example.com/milk.jpg',
    })
  })

  it('falls back to sensible defaults when optional fields are missing', () => {
    const apiItem: ApiItem = {
      _id: 'item-2',
      categoryID: 'unknown-cat',
      name: 'Mystery Box',
      amount: 0,
    }

    expect(normalizeItem(apiItem, categoryNameById)).toEqual({
      id: 'item-2',
      name: 'Mystery Box',
      sku: '',
      category: 'Uncategorized',
      quantity: 0,
      unit: 'units',
      min: 0,
      image: undefined,
    })
  })
})

describe('mergeCategoryNames', () => {
  it('returns the starter list when nothing has been fetched', () => {
    expect(mergeCategoryNames(['Dairy', 'Syrups'], [])).toEqual(['Dairy', 'Syrups'])
  })

  it('adds fetched categories the account has that are not in the starter list', () => {
    expect(mergeCategoryNames(['Dairy', 'Syrups'], ['Electronics'])).toEqual(['Dairy', 'Syrups', 'Electronics'])
  })

  it('does not duplicate categories that appear in both lists', () => {
    expect(mergeCategoryNames(['Dairy', 'Syrups'], ['Dairy', 'Bakery'])).toEqual(['Dairy', 'Syrups', 'Bakery'])
  })
})
