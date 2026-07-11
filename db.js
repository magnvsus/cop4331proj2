// db.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const DB_NAME = process.env.MONGODB_DB_NAME;

let client = null;
let db = null;
let connectionPromise = null;

function isConfigured()
{
  return !!process.env.MONGODB_URI;
}

async function connectDB()
{
  if (db) return db;                 // already connected, reuse it

  if (!isConfigured())
  {
    console.warn('[db] MONGODB_URI is not set yet -- server is running without a database. ' +
      'Add the connection string to .env once it is ready; no code changes needed.');
    return null;
  }

  if (!connectionPromise)
  {
    client = new MongoClient(process.env.MONGODB_URI);
    connectionPromise = client.connect()
      .then(() =>
      {
        db = client.db(DB_NAME);
        console.log('[db] Connected to MongoDB');
        return db;
      })
      .catch((err) =>
      {
        console.error('[db] Connection failed:', err.message);
        connectionPromise = null;    // let the next request try again
        return null;
      });
  }

  return connectionPromise;
}

function getDB()
{
  return db;
}

module.exports = { connectDB, getDB, isConfigured };