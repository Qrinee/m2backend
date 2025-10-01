const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serwowanie plików statycznych
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Połączenie z MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/property_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => {
  console.log('Połączono z MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Błąd połączenia z MongoDB:', err);
});

// Routes
app.use('/api/properties', require('./routes/properties'));
app.use('/api/emails', require('./routes/emails'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users')); // DODAJ TĘ LINIĘ

// Health check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Coś poszło nie tak!' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});